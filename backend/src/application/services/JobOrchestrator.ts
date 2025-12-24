import {
  ImprovementJob,
  IJobRepository,
  IGitHubRepoRepository,
  ICoverageFileRepository,
  CoveragePercentage,
  GitHubPrUrl,
  IGitHubService,
  IGitHubApiClient,
  IAiProviderFactory,
  ICommandRunner,
  ICoverageParser,
} from '../../domain';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { execSync } from 'child_process';

export interface JobProgressCallback {
  (jobId: string, progress: number, message: string): void;
}

/**
 * Orchestrates the execution of improvement jobs.
 * Implements iterative test generation with coverage validation.
 */
export class JobOrchestrator {
  private isProcessing = false;
  private progressCallback?: JobProgressCallback;
  private readonly maxRetries: number;
  private readonly coverageThreshold: number;

  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly repoRepository: IGitHubRepoRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
    private readonly githubService: IGitHubService,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly aiProviderFactory: IAiProviderFactory,
    private readonly commandRunner: ICommandRunner,
    private readonly coverageParser: ICoverageParser,
  ) {
    this.maxRetries = parseInt(process.env.AI_MAX_RETRIES || '3', 10);
    this.coverageThreshold = parseInt(process.env.COVERAGE_THRESHOLD || '80', 10);
  }

  setProgressCallback(callback: JobProgressCallback): void {
    this.progressCallback = callback;
  }

  async startProcessing(intervalMs: number = 5000): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.isProcessing) {
      await this.processNextJob();
      await this.sleep(intervalMs);
    }
  }

  stopProcessing(): void {
    this.isProcessing = false;
  }

  async processNextJob(): Promise<ImprovementJob | null> {
    const pendingJobs = await this.jobRepo.findPending(1);
    if (pendingJobs.length === 0) {
      return null;
    }

    const job = pendingJobs[0];

    const runningJobs = await this.jobRepo.findByRepositoryId(job.repositoryId);
    const hasRunning = runningJobs.some(j => j.status.value === 'running' && j.id !== job.id);
    if (hasRunning) {
      return null;
    }

    return this.executeJob(job);
  }

  async executeJob(job: ImprovementJob): Promise<ImprovementJob> {
    let clonePath: string | null = null;

    try {
      // 1. Mark job as running
      job.start();
      await this.jobRepo.save(job);
      this.emitProgress(job.id, 5, 'Job started');

      // 2. Get repository and file info
      const repository = await this.repoRepository.findById(job.repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${job.repositoryId}`);
      }

      const coverageFile = await this.coverageFileRepo.findById(job.fileId);
      if (!coverageFile) {
        throw new Error(`Coverage file not found: ${job.fileId}`);
      }

      this.emitProgress(job.id, 10, 'Cloning repository');

      // 3. Clone repository
      clonePath = this.githubService.getTempDir(job.id);
      await this.githubService.clone({
        repoUrl: repository.url,
        targetDir: clonePath,
        branch: repository.defaultBranch,
      });

      // 4. Install dependencies
      this.emitProgress(job.id, 15, 'Installing dependencies');
      const projectDir = coverageFile.projectDir
        ? join(clonePath, coverageFile.projectDir)
        : clonePath;

      const packageManager = this.commandRunner.detectPackageManager(projectDir);
      await this.commandRunner.installDependencies(projectDir, packageManager);

      this.emitProgress(job.id, 20, 'Creating branch');

      // 5. Create improvement branch
      const branchName = this.githubService.generateBranchName(coverageFile.path.value);
      await this.githubService.createBranch(clonePath, branchName);

      // 6. Read the source file
      const sourceFilePath = join(clonePath, coverageFile.path.value);
      if (!existsSync(sourceFilePath)) {
        throw new Error(`Source file not found: ${coverageFile.path.value}`);
      }
      const sourceContent = readFileSync(sourceFilePath, 'utf-8');

      // 7. Find existing test file if any
      const testFilePath = this.findTestFile(clonePath, coverageFile.path.value);
      const existingTestContent = testFilePath && existsSync(join(clonePath, testFilePath))
        ? readFileSync(join(clonePath, testFilePath), 'utf-8')
        : undefined;

      // 8. Agent will explore the project itself to find test conventions

      // 9. Iterative test generation loop
      let attempt = 0;
      let currentCoverage = coverageFile.coveragePercentage.value;
      let generatedTestPath: string | null = null;
      let generatedTestContent: string | null = null;
      // Track current uncovered lines - starts with original, updates after each run
      let currentUncoveredLines = [...coverageFile.uncoveredLines];

      while (attempt < this.maxRetries && currentCoverage < this.coverageThreshold) {
        attempt++;
        const progressBase = 25 + (attempt - 1) * 20;

        this.emitProgress(job.id, progressBase, `Generating tests (attempt ${attempt}/${this.maxRetries})`);
        console.log(`\n=== Attempt ${attempt}/${this.maxRetries} ===`);
        console.log(`Current coverage: ${currentCoverage}%, Target: ${this.coverageThreshold}%`);
        console.log(`Uncovered lines to target: ${currentUncoveredLines.join(', ')}`);

        // Generate tests using AI (agentic mode - AI writes files directly)
        const aiProvider = this.aiProviderFactory.getProvider(job.aiProvider);
        console.log(`[JobOrchestrator] Using AI provider: ${aiProvider.name}`);
        console.log(`[JobOrchestrator] Calling AI to generate tests (agentic mode)...`);

        // On retry, use the test file we created in previous attempt
        const currentTestPath = generatedTestPath || testFilePath;

        // AI runs in agentic mode - it will create/modify files directly in clonePath
        // Agent explores the project itself to find test conventions
        // Pass CURRENT uncovered lines (updated after each coverage run)
        await aiProvider.generateTests({
          filePath: coverageFile.path.value,
          fileContent: sourceContent,
          uncoveredLines: currentUncoveredLines,
          existingTestPath: currentTestPath,
          projectDir: clonePath,
        });

        // Check what test files were created/modified by the AI
        const newTestFiles = this.getChangedFiles(clonePath).filter(f => this.isTestFile(f));
        console.log(`[JobOrchestrator] AI created/modified test files: ${newTestFiles.join(', ') || 'none'}`);

        // Determine expected test file path
        const expectedTestPath = testFilePath || coverageFile.path.value.replace('.ts', '.test.ts');
        const fullTestPath = join(clonePath, expectedTestPath);

        if (!existsSync(fullTestPath) && newTestFiles.length === 0) {
          console.log(`[JobOrchestrator] WARNING: No test file created, will retry...`);
          if (attempt < this.maxRetries) {
            continue;
          } else {
            throw new Error('AI failed to create test file after all attempts');
          }
        }

        // Use the first new test file, or the expected path
        generatedTestPath = newTestFiles.length > 0 ? newTestFiles[0] : expectedTestPath;
        const actualTestPath = join(clonePath, generatedTestPath);

        // Quick validation - read content to check for test patterns
        const testContent = readFileSync(actualTestPath, 'utf-8');
        console.log(`[JobOrchestrator] Test file: ${generatedTestPath} (${testContent.length} chars)`);

        if (!this.isValidTestContent(testContent)) {
          console.log(`[JobOrchestrator] WARNING: Test file doesn't look valid, will retry...`);
          if (attempt < this.maxRetries) {
            continue;
          } else {
            throw new Error('AI failed to generate valid test content after all attempts');
          }
        }

        // Store content for next iteration (AI can extend it)
        generatedTestContent = testContent;

        this.emitProgress(job.id, progressBase + 10, `Running tests (attempt ${attempt}/${this.maxRetries})`);

        // Run tests with coverage
        const testResult = await this.commandRunner.runTestsWithCoverage(projectDir, packageManager, true);
        console.log(`Tests exited with code: ${testResult.exitCode}`);
        if (testResult.stdout) {
          // Show last 1000 chars of test output to see what ran
          const output = testResult.stdout.slice(-1000);
          console.log(`[JobOrchestrator] Test output (last 1000 chars):\n${output}`);
        }
        if (testResult.stderr && testResult.exitCode !== 0) {
          console.log(`[JobOrchestrator] Test errors:\n${testResult.stderr.slice(-500)}`);
        }

        // Parse coverage for the specific file
        this.coverageParser.setProjectRoot(clonePath);
        const coverageReport = await this.parseCoverageOutput(projectDir);

        console.log(`[JobOrchestrator] Coverage report: ${coverageReport.files.length} files, total: ${coverageReport.totalCoverage}%`);
        console.log(`[JobOrchestrator] Files in coverage report: ${coverageReport.files.map(f => `${f.path}(${f.percentage}%)`).join(', ')}`);
        console.log(`[JobOrchestrator] Looking for: ${coverageFile.path.value} or ending with ${basename(coverageFile.path.value)}`);

        // Find coverage for our target file (exact match first, then basename match)
        let fileCoverage = coverageReport.files.find(f => f.path === coverageFile.path.value);
        if (!fileCoverage) {
          // Try matching by full basename with path context
          const targetBasename = basename(coverageFile.path.value);
          const targetDir = dirname(coverageFile.path.value);
          fileCoverage = coverageReport.files.find(f =>
            f.path.endsWith(`/${targetBasename}`) && f.path.includes(basename(targetDir))
          );
        }
        if (!fileCoverage) {
          // Last resort: match by basename only
          fileCoverage = coverageReport.files.find(f =>
            basename(f.path) === basename(coverageFile.path.value)
          );
        }

        if (fileCoverage) {
          currentCoverage = fileCoverage.percentage;
          // Update uncovered lines for next iteration - these are the REMAINING uncovered lines
          const previousUncovered = currentUncoveredLines.length;
          currentUncoveredLines = fileCoverage.uncoveredLines;
          console.log(`New coverage for ${coverageFile.path.value}: ${currentCoverage}%`);
          console.log(`Uncovered lines: ${previousUncovered} -> ${currentUncoveredLines.length} (remaining: ${currentUncoveredLines.join(', ')})`);

          // Update coverage in database so frontend can see progress
          coverageFile.updateCoverage(
            CoveragePercentage.create(currentCoverage),
            currentUncoveredLines,
          );
          await this.coverageFileRepo.save(coverageFile);
        } else {
          console.log('Could not find coverage for target file, using total coverage');
          currentCoverage = coverageReport.totalCoverage;
        }

        if (currentCoverage >= this.coverageThreshold) {
          console.log(`Coverage target met! ${currentCoverage}% >= ${this.coverageThreshold}%`);
          break;
        }

        if (attempt < this.maxRetries) {
          console.log(`Coverage still below threshold, will retry with remaining uncovered lines...`);
        }
      }

      if (!generatedTestPath) {
        throw new Error('No test file was generated');
      }

      this.emitProgress(job.id, 70, 'Validating changes');

      // 10. Reset any non-test files (like package-lock.json from npm install)
      this.resetNonTestFiles(clonePath);

      // 11. Validate diff - only test files should be changed
      const changedFiles = this.getChangedFiles(clonePath);
      const invalidFiles = changedFiles.filter(f => !this.isTestFile(f));

      if (invalidFiles.length > 0) {
        throw new Error(`Invalid files modified (only test files allowed): ${invalidFiles.join(', ')}`);
      }

      console.log(`Changed files: ${changedFiles.join(', ')}`);

      this.emitProgress(job.id, 80, 'Committing changes');

      // 11. Commit and push
      await this.githubService.commitAndPush({
        workDir: clonePath,
        branch: branchName,
        message: `test: improve coverage for ${coverageFile.path.value}\n\nCoverage: ${currentCoverage.toFixed(1)}%`,
        files: changedFiles,
      });

      this.emitProgress(job.id, 90, 'Creating pull request');

      // 12. Create PR
      const prInfo = await this.githubApiClient.createPullRequest({
        owner: repository.owner,
        repo: repository.name,
        title: `Improve test coverage for ${basename(coverageFile.path.value)}`,
        body: this.generatePrDescription(coverageFile.path.value, coverageFile.uncoveredLines, currentCoverage, attempt),
        head: branchName,
        base: repository.defaultBranch,
      });

      // 13. Mark job as completed
      job.complete(GitHubPrUrl.create(prInfo.url));
      await this.jobRepo.save(job);

      // 14. Update coverage file status
      coverageFile.markAsImproved(
        CoveragePercentage.create(currentCoverage),
        [],
      );
      await this.coverageFileRepo.save(coverageFile);

      this.emitProgress(job.id, 100, `Completed (${currentCoverage.toFixed(1)}% coverage)`);

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.fail(errorMessage);
      await this.jobRepo.save(job);

      const coverageFile = await this.coverageFileRepo.findById(job.fileId);
      if (coverageFile) {
        coverageFile.resetToPending();
        await this.coverageFileRepo.save(coverageFile);
      }

      this.emitProgress(job.id, 0, `Failed: ${errorMessage}`);

      return job;
    } finally {
      if (clonePath) {
        await this.githubService.cleanupWorkDir(clonePath);
      }
    }
  }

  private async parseCoverageOutput(projectDir: string): Promise<{
    files: Array<{ path: string; percentage: number; uncoveredLines: number[] }>;
    totalCoverage: number;
  }> {
    const istanbulPath = join(projectDir, 'coverage', 'coverage-final.json');
    if (existsSync(istanbulPath)) {
      const report = await this.coverageParser.parseIstanbulJson(istanbulPath);
      return {
        files: report.files.map(f => ({ path: f.path, percentage: f.percentage, uncoveredLines: f.uncoveredLines })),
        totalCoverage: report.totalCoverage,
      };
    }

    const lcovPath = join(projectDir, 'coverage', 'lcov.info');
    if (existsSync(lcovPath)) {
      const report = await this.coverageParser.parseLcov(lcovPath);
      return {
        files: report.files.map(f => ({ path: f.path, percentage: f.percentage, uncoveredLines: f.uncoveredLines })),
        totalCoverage: report.totalCoverage,
      };
    }

    return { files: [], totalCoverage: 0 };
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
      // Get all changed files
      const changedFiles = this.getChangedFiles(workDir);

      // Reset any modified non-test files (like package-lock.json)
      const nonTestFiles = changedFiles.filter(f => !this.isTestFile(f));

      for (const file of nonTestFiles) {
        try {
          // Try to checkout the file (revert changes)
          execSync(`git checkout -- "${file}"`, { cwd: workDir, encoding: 'utf-8' });
          console.log(`[JobOrchestrator] Reset non-test file: ${file}`);
        } catch {
          // If file is untracked (new), remove it
          try {
            execSync(`rm -f "${file}"`, { cwd: workDir, encoding: 'utf-8' });
            console.log(`[JobOrchestrator] Removed untracked non-test file: ${file}`);
          } catch {
            // Ignore errors
          }
        }
      }
    } catch {
      console.log('[JobOrchestrator] Warning: Could not reset non-test files');
    }
  }

  private isTestFile(filePath: string): boolean {
    return filePath.endsWith('.test.ts') || filePath.endsWith('.spec.ts') ||
           filePath.endsWith('.test.js') || filePath.endsWith('.spec.js');
  }

  private isValidTestContent(content: string): boolean {
    // Check for common test framework patterns
    const hasDescribe = /\bdescribe\s*\(/.test(content);
    const hasIt = /\bit\s*\(/.test(content);
    const hasTest = /\btest\s*\(/.test(content);
    const hasExpect = /\bexpect\s*\(/.test(content);

    // Must have at least describe/it/test AND expect
    const hasTestStructure = hasDescribe || hasIt || hasTest;
    const hasAssertions = hasExpect;

    return hasTestStructure && hasAssertions;
  }

  private findTestFile(clonePath: string, sourcePath: string): string | undefined {
    const baseName = sourcePath.replace('.ts', '');
    const patterns = [
      `${baseName}.spec.ts`,
      `${baseName}.test.ts`,
      sourcePath.replace('/src/', '/test/').replace('.ts', '.spec.ts'),
      sourcePath.replace('/src/', '/__tests__/').replace('.ts', '.test.ts'),
    ];

    for (const pattern of patterns) {
      const fullPath = join(clonePath, pattern);
      if (existsSync(fullPath)) {
        return pattern;
      }
    }

    return undefined;
  }

  private findExampleTestFiles(
    projectDir: string,
    currentFilePath: string
  ): Array<{ path: string; content: string }> {
    const examples: Array<{ path: string; content: string }> = [];

    const testDirs = [
      join(projectDir, 'src'),
      join(projectDir, '__tests__'),
      join(projectDir, 'test'),
    ];

    for (const dir of testDirs) {
      if (!existsSync(dir) || examples.length >= 2) continue;

      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (examples.length >= 2) break;
          if ((file.endsWith('.test.ts') || file.endsWith('.spec.ts')) &&
              !file.includes(basename(currentFilePath).replace('.ts', ''))) {
            const content = readFileSync(join(dir, file), 'utf-8');
            if (content.length < 3000) {
              examples.push({ path: file, content });
            }
          }
        }
      } catch {
        // Skip errors
      }
    }

    return examples;
  }

  private generatePrDescription(filePath: string, uncoveredLines: number[], finalCoverage: number, attempts: number): string {
    return `## Summary
This PR improves test coverage for \`${filePath}\`.

### Results
- **Final Coverage:** ${finalCoverage.toFixed(1)}%
- **AI Attempts:** ${attempts}
- **Lines Targeted:** ${uncoveredLines.slice(0, 10).join(', ')}${uncoveredLines.length > 10 ? '...' : ''}

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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
