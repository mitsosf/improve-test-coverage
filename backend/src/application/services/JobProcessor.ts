import {
  Job,
  IJobRepository,
  IGitHubRepoRepository,
  ICoverageFileRepository,
  CoverageFile,
  CoveragePercentage,
  FilePath,
  GitHubPrUrl,
  GitHubRepo,
  AiProvider,
} from '../../domain';
import {
  IGitHubService,
  IGitHubApiClient,
  ICoverageParser,
  ClaudeProvider,
  OpenAiProvider,
  ISandbox,
} from '../../infrastructure';
import { join, basename } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

export interface JobProgressCallback {
  (jobId: string, progress: number, message: string): void;
}

/**
 * Job orchestrator - handles job lifecycle and delegates to sandbox for untrusted operations.
 * Analysis jobs: runs tests in sandbox, parses coverage, stores results
 * Improvement jobs: gets source files via sandbox, generates tests via AI, validates in sandbox, creates PR
 */
export class JobProcessor {
  private progressCallback?: JobProgressCallback;
  private readonly coverageThreshold: number;

  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly repoRepository: IGitHubRepoRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
    private readonly githubService: IGitHubService,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly coverageParser: ICoverageParser,
    private readonly sandbox: ISandbox,
  ) {
    this.coverageThreshold = parseInt(process.env.COVERAGE_THRESHOLD || '80', 10);
  }

  setProgressCallback(callback: JobProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Process the next pending job of any type
   */
  async processNextJob(): Promise<Job | null> {
    const pendingJobs = await this.jobRepo.findPending(1);
    if (pendingJobs.length === 0) {
      return null;
    }

    const job = pendingJobs[0];

    // Check if there's already a running job of the same type for the same repo
    const runningJobs = await this.jobRepo.findRunning(job.type);
    if (job.type === 'analysis' && runningJobs.length > 0) {
      return null; // Only one analysis job at a time
    }
    if (job.type === 'improvement') {
      const repoRunningJobs = runningJobs.filter(j => j.repositoryId === job.repositoryId);
      if (repoRunningJobs.length > 0) {
        return null; // One improvement job per repo at a time
      }
    }

    return this.executeJob(job);
  }

  /**
   * Execute a job based on its type
   */
  async executeJob(job: Job): Promise<Job> {
    if (job.type === 'analysis') {
      return this.executeAnalysisJob(job);
    } else {
      return this.executeImprovementJob(job);
    }
  }

  // ============= ANALYSIS JOB EXECUTION =============

  private async executeAnalysisJob(job: Job): Promise<Job> {
    try {
      job.start();
      await this.jobRepo.save(job);
      this.emitProgress(job.id, 5, 'Starting analysis');

      // Get or create repository
      let repository = await this.repoRepository.findById(job.repositoryId);
      if (!repository) {
        const { owner, name } = GitHubRepo.fromGitHubUrl(job.repositoryUrl!);
        repository = GitHubRepo.create({
          url: job.repositoryUrl!,
          owner,
          name,
          branch: job.branch || 'main',
          defaultBranch: job.branch || 'main',
        });
        await this.repoRepository.save(repository);
      }

      this.emitProgress(job.id, 10, 'Running analysis in sandbox');

      // Run analysis in sandbox (clone, install, test - all isolated)
      const sandboxResult = await this.sandbox.runAnalysis({
        repoUrl: job.repositoryUrl!,
        branch: job.branch || 'main',
        onProgress: (msg) => {
          console.log(`[Sandbox] ${msg}`);
        },
      });

      if (!sandboxResult.success) {
        throw new Error(sandboxResult.error || 'Sandbox analysis failed');
      }

      this.emitProgress(job.id, 60, 'Parsing coverage results');

      // Parse coverage from sandbox output
      const coverageReport = this.parseSandboxCoverage(sandboxResult.coverageJson);

      // Add uncovered source files (0% coverage)
      if (sandboxResult.sourceFiles) {
        const coveredPaths = new Set(coverageReport.files.map(f => f.path));
        for (const sourceFile of sandboxResult.sourceFiles) {
          if (!coveredPaths.has(sourceFile.path)) {
            coverageReport.files.push({
              path: sourceFile.path,
              linesCovered: 0,
              linesTotal: 1,
              percentage: 0,
              uncoveredLines: [1],
            });
          }
        }
      }

      // Recalculate total coverage
      const totalCovered = coverageReport.files.reduce((sum, f) => sum + f.linesCovered, 0);
      const totalLines = coverageReport.files.reduce((sum, f) => sum + f.linesTotal, 0);
      coverageReport.totalCoverage = totalLines > 0
        ? Math.round((totalCovered / totalLines) * 100 * 100) / 100
        : 0;
      coverageReport.files.sort((a, b) => a.percentage - b.percentage);

      this.emitProgress(job.id, 80, 'Storing coverage data');

      // Clear old coverage data and store new
      await this.coverageFileRepo.deleteByRepositoryId(repository.id);
      let filesBelowThreshold = 0;

      for (const fileReport of coverageReport.files) {
        const coverageFile = CoverageFile.create({
          repositoryId: repository.id,
          path: FilePath.create(fileReport.path),
          coveragePercentage: CoveragePercentage.create(fileReport.percentage),
          uncoveredLines: fileReport.uncoveredLines,
          projectDir: undefined, // Sandbox handles project detection internally
        });
        await this.coverageFileRepo.save(coverageFile);

        if (fileReport.percentage < this.coverageThreshold) {
          filesBelowThreshold++;
        }
      }

      // Update repository
      repository.markAsAnalyzed();
      await this.repoRepository.save(repository);

      // Complete job
      job.completeAnalysis(coverageReport.files.length, filesBelowThreshold);
      await this.jobRepo.save(job);
      this.emitProgress(job.id, 100, `Analysis complete: ${coverageReport.files.length} files, ${filesBelowThreshold} below threshold`);

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.fail(errorMessage);
      await this.jobRepo.save(job);
      this.emitProgress(job.id, 0, `Failed: ${errorMessage}`);
      return job;
    }
  }

  // ============= IMPROVEMENT JOB EXECUTION =============

  private async executeImprovementJob(job: Job): Promise<Job> {
    let clonePath: string | null = null;

    try {
      job.start();
      await this.jobRepo.save(job);
      const fileCount = job.fileCount;
      this.emitProgress(job.id, 5, `Starting improvement for ${fileCount} file${fileCount > 1 ? 's' : ''}`);

      const repository = await this.repoRepository.findById(job.repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${job.repositoryId}`);
      }

      // Load all coverage files
      const coverageFiles = await Promise.all(
        job.fileIds.map(async (id) => {
          const file = await this.coverageFileRepo.findById(id);
          if (!file) {
            throw new Error(`Coverage file not found: ${id}`);
          }
          return file;
        })
      );

      await this.updateAndSaveProgress(job, 10, 'Getting source files from sandbox');

      // First, run sandbox analysis to get source file contents
      const analysisResult = await this.sandbox.runAnalysis({
        repoUrl: repository.url,
        branch: repository.defaultBranch,
        onProgress: (msg) => console.log(`[Sandbox] ${msg}`),
      });

      if (!analysisResult.success || !analysisResult.sourceFiles) {
        throw new Error('Failed to get source files from sandbox');
      }

      // Match coverage files to source files
      const filesToImprove = coverageFiles.map(cf => {
        const sourceFile = analysisResult.sourceFiles!.find(sf =>
          sf.path === cf.path.value || sf.path.endsWith(cf.path.value) || cf.path.value.endsWith(sf.path)
        );
        if (!sourceFile) {
          throw new Error(`Source file not found in sandbox: ${cf.path.value}`);
        }
        return {
          filePath: cf.path.value,
          fileContent: sourceFile.content,
          uncoveredLines: cf.uncoveredLines,
        };
      });

      await this.updateAndSaveProgress(job, 30, `Generating tests for ${fileCount} file${fileCount > 1 ? 's' : ''}`);

      // Clone locally for AI to work with (AI is trusted, runs on host)
      clonePath = this.githubService.getTempDir(job.id);
      await this.githubService.clone({
        repoUrl: repository.url,
        targetDir: clonePath,
        branch: repository.defaultBranch,
      });

      // Get AI provider and generate tests
      const aiProvider = this.getAiProvider(job.aiProvider!);
      await aiProvider.generateTests({
        files: filesToImprove,
        projectDir: clonePath,
      });

      await this.updateAndSaveProgress(job, 50, 'Validating generated tests');

      // Validate that test files were created
      const changedFiles = this.getChangedFiles(clonePath);
      const testFiles = changedFiles.filter(f => this.isTestFile(f));

      if (testFiles.length === 0) {
        throw new Error('AI failed to create any test files');
      }

      // Validate test content and collect test file contents
      const testFileContents: Array<{ path: string; content: string }> = [];
      for (const testFile of testFiles) {
        const testPath = join(clonePath, testFile);
        const testContent = readFileSync(testPath, 'utf-8');
        if (!this.isValidTestContent(testContent)) {
          throw new Error(`Invalid test content in ${testFile}`);
        }
        testFileContents.push({ path: testFile, content: testContent });
      }

      // Reset any non-test files the AI may have touched
      this.resetNonTestFiles(clonePath);

      await this.updateAndSaveProgress(job, 60, 'Running tests in sandbox');

      // Run tests in sandbox with generated test files
      const testResult = await this.sandbox.runTests({
        repoUrl: repository.url,
        branch: repository.defaultBranch,
        testFiles: testFileContents,
        onProgress: (msg) => console.log(`[Sandbox] ${msg}`),
      });

      if (!testResult.success) {
        throw new Error(testResult.error || 'Sandbox test run failed');
      }

      if (!testResult.testsPassed) {
        throw new Error('Generated tests failed');
      }

      // Parse new coverage
      const coverageReport = this.parseSandboxCoverage(testResult.coverageJson);

      // Update coverage for each file
      let totalImprovedCoverage = 0;
      for (const coverageFile of coverageFiles) {
        let fileCoverage = coverageReport.files.find(f => f.path === coverageFile.path.value);
        if (!fileCoverage) {
          fileCoverage = coverageReport.files.find(f =>
            basename(f.path) === basename(coverageFile.path.value)
          );
        }

        if (fileCoverage) {
          coverageFile.updateCoverage(
            CoveragePercentage.create(fileCoverage.percentage),
            fileCoverage.uncoveredLines,
          );
          totalImprovedCoverage += fileCoverage.percentage;
        }
        await this.coverageFileRepo.save(coverageFile);
      }
      const avgCoverage = totalImprovedCoverage / coverageFiles.length;

      await this.updateAndSaveProgress(job, 80, 'Committing changes');

      // Create branch and commit (trusted git operations on host)
      const branchName = fileCount === 1
        ? this.githubService.generateBranchName(coverageFiles[0].path.value)
        : this.githubService.generateBranchName(`${fileCount}-files`);
      await this.githubService.createBranch(clonePath, branchName);

      const finalChangedFiles = this.getChangedFiles(clonePath);
      const commitMessage = fileCount === 1
        ? `test: improve coverage for ${coverageFiles[0].path.value}\n\nCoverage: ${avgCoverage.toFixed(1)}%`
        : `test: improve coverage for ${fileCount} files\n\nFiles: ${job.filePaths.join(', ')}\nAverage coverage: ${avgCoverage.toFixed(1)}%`;

      await this.githubService.commitAndPush({
        workDir: clonePath,
        branch: branchName,
        message: commitMessage,
        files: finalChangedFiles,
      });

      await this.updateAndSaveProgress(job, 90, 'Creating pull request');

      const prTitle = fileCount === 1
        ? `Improve test coverage for ${basename(coverageFiles[0].path.value)}`
        : `Improve test coverage for ${fileCount} files`;

      const prInfo = await this.githubApiClient.createPullRequest({
        owner: repository.owner,
        repo: repository.name,
        title: prTitle,
        body: this.generateMultiFilePrDescription(coverageFiles, avgCoverage),
        head: branchName,
        base: repository.defaultBranch,
      });

      job.completeImprovement(GitHubPrUrl.create(prInfo.url));
      await this.jobRepo.save(job);

      // Mark all files as improved
      for (const coverageFile of coverageFiles) {
        coverageFile.markAsImproved(coverageFile.coveragePercentage, coverageFile.uncoveredLines);
        await this.coverageFileRepo.save(coverageFile);
      }

      this.emitProgress(job.id, 100, `Completed (${avgCoverage.toFixed(1)}% avg coverage)`);

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.fail(errorMessage);
      await this.jobRepo.save(job);

      // Reset all files to pending
      for (const fileId of job.fileIds) {
        const coverageFile = await this.coverageFileRepo.findById(fileId);
        if (coverageFile) {
          coverageFile.resetToPending();
          await this.coverageFileRepo.save(coverageFile);
        }
      }

      this.emitProgress(job.id, 0, `Failed: ${errorMessage}`);
      return job;
    } finally {
      if (clonePath) {
        await this.githubService.cleanupWorkDir(clonePath);
      }
    }
  }

  // ============= SHARED UTILITIES =============

  private getAiProvider(provider: AiProvider) {
    return provider === 'claude' ? new ClaudeProvider() : new OpenAiProvider();
  }

  private parseSandboxCoverage(coverageJson?: Record<string, unknown>): {
    files: Array<{ path: string; linesCovered: number; linesTotal: number; percentage: number; uncoveredLines: number[] }>;
    totalCoverage: number;
  } {
    if (!coverageJson) {
      return { files: [], totalCoverage: 0 };
    }

    // Parse Istanbul format coverage JSON
    const files: Array<{ path: string; linesCovered: number; linesTotal: number; percentage: number; uncoveredLines: number[] }> = [];

    for (const [filePath, data] of Object.entries(coverageJson)) {
      const fileData = data as {
        s?: Record<string, number>;
        statementMap?: Record<string, { start: { line: number }; end: { line: number } }>;
      };

      if (!fileData.s || !fileData.statementMap) continue;

      const statementCounts = fileData.s;
      const statementMap = fileData.statementMap;

      let covered = 0;
      let total = 0;
      const uncoveredLines: number[] = [];
      const linesCovered = new Set<number>();
      const linesUncovered = new Set<number>();

      for (const [stmtId, count] of Object.entries(statementCounts)) {
        total++;
        const stmt = statementMap[stmtId];
        if (stmt) {
          if (count > 0) {
            covered++;
            for (let line = stmt.start.line; line <= stmt.end.line; line++) {
              linesCovered.add(line);
            }
          } else {
            for (let line = stmt.start.line; line <= stmt.end.line; line++) {
              if (!linesCovered.has(line)) {
                linesUncovered.add(line);
              }
            }
          }
        }
      }

      // Convert to relative path if needed
      const relativePath = filePath.replace(/^\/workspace\/repo\//, '');

      files.push({
        path: relativePath,
        linesCovered: covered,
        linesTotal: total,
        percentage: total > 0 ? Math.round((covered / total) * 100 * 100) / 100 : 0,
        uncoveredLines: Array.from(linesUncovered).sort((a, b) => a - b),
      });
    }

    const totalCovered = files.reduce((sum, f) => sum + f.linesCovered, 0);
    const totalLines = files.reduce((sum, f) => sum + f.linesTotal, 0);
    const totalCoverage = totalLines > 0 ? Math.round((totalCovered / totalLines) * 100 * 100) / 100 : 0;

    return { files, totalCoverage };
  }

  private isTestFile(filePath: string): boolean {
    return filePath.endsWith('.test.ts') || filePath.endsWith('.spec.ts') ||
           filePath.endsWith('.test.js') || filePath.endsWith('.spec.js');
  }

  private isValidTestContent(content: string): boolean {
    const hasDescribe = /\bdescribe\s*\(/.test(content);
    const hasIt = /\bit\s*\(/.test(content);
    const hasTest = /\btest\s*\(/.test(content);
    const hasExpect = /\bexpect\s*\(/.test(content);
    return (hasDescribe || hasIt || hasTest) && hasExpect;
  }

  private getChangedFiles(workDir: string): string[] {
    try {
      const output = execSync('git diff --name-only HEAD', { cwd: workDir, encoding: 'utf-8' });
      const stagedOutput = execSync('git diff --name-only --cached', { cwd: workDir, encoding: 'utf-8' });
      const untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: workDir, encoding: 'utf-8' });

      const allFiles = [...output.split('\n'), ...stagedOutput.split('\n'), ...untrackedOutput.split('\n')]
        .filter(f => f.trim().length > 0);

      return [...new Set(allFiles)];
    } catch {
      return [];
    }
  }

  private resetNonTestFiles(workDir: string): void {
    try {
      const changedFiles = this.getChangedFiles(workDir);
      const nonTestFiles = changedFiles.filter(f => !this.isTestFile(f));

      for (const file of nonTestFiles) {
        try {
          execSync(`git checkout -- "${file}"`, { cwd: workDir, encoding: 'utf-8' });
        } catch {
          try {
            execSync(`rm -f "${file}"`, { cwd: workDir, encoding: 'utf-8' });
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  private generateMultiFilePrDescription(coverageFiles: CoverageFile[], avgCoverage: number): string {
    const fileCount = coverageFiles.length;
    const fileList = coverageFiles.map(f =>
      `- \`${f.path.value}\` (${f.coveragePercentage.value.toFixed(1)}%)`
    ).join('\n');

    return `## Summary
This PR improves test coverage for ${fileCount} file${fileCount > 1 ? 's' : ''}.

### Files
${fileList}

### Results
- **Average Coverage:** ${avgCoverage.toFixed(1)}%

### Test Plan
- [ ] Review generated tests
- [ ] Run test suite locally
- [ ] Verify coverage improvement

---
🤖 Generated by Coverage Improver`;
  }

  private emitProgress(jobId: string, progress: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback(jobId, progress, message);
    }
    console.log(`[Job ${jobId}] ${progress}% - ${message}`);
  }

  private async updateAndSaveProgress(job: Job, progress: number, message: string): Promise<void> {
    job.updateProgress(progress);
    await this.jobRepo.save(job);
    this.emitProgress(job.id, progress, message);
  }
}
