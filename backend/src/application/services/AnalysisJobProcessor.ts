import {
  AnalysisJob,
  IAnalysisJobRepository,
  IGitHubRepoRepository,
  ICoverageFileRepository,
  IGitHubService,
  ICoverageParser,
  ICommandRunner,
  CoverageFile,
  CoveragePercentage,
  FilePath,
  GitHubRepo,
} from '../../domain';
import { join, relative } from 'path';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';

export interface AnalysisProgressCallback {
  (jobId: string, progress: number, message: string): void;
}

/**
 * Processes analysis jobs in the background.
 * Clones repos, runs tests with coverage, and stores results.
 */
export class AnalysisJobProcessor {
  private isProcessing = false;
  private progressCallback?: AnalysisProgressCallback;

  constructor(
    private readonly analysisJobRepo: IAnalysisJobRepository,
    private readonly repoRepository: IGitHubRepoRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
    private readonly githubService: IGitHubService,
    private readonly coverageParser: ICoverageParser,
    private readonly commandRunner: ICommandRunner,
  ) {}

  setProgressCallback(callback: AnalysisProgressCallback): void {
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

  async processNextJob(): Promise<AnalysisJob | null> {
    const pendingJobs = await this.analysisJobRepo.findPending(1);
    if (pendingJobs.length === 0) {
      return null;
    }

    const job = pendingJobs[0];

    // Check if there's already a running analysis job
    const runningJobs = await this.analysisJobRepo.findRunning();
    if (runningJobs.length > 0) {
      return null;
    }

    return this.executeJob(job);
  }

  async executeJob(job: AnalysisJob): Promise<AnalysisJob> {
    let clonePath: string | null = null;

    try {
      job.start();
      await this.analysisJobRepo.save(job);
      this.emitProgress(job.id, 5, 'Starting analysis');

      // Get or create repository
      let repository = await this.repoRepository.findById(job.repositoryId);
      if (!repository) {
        const { owner, name } = GitHubRepo.fromGitHubUrl(job.repositoryUrl);
        repository = GitHubRepo.create({
          url: job.repositoryUrl,
          owner,
          name,
          defaultBranch: job.branch,
        });
        await this.repoRepository.save(repository);
      }

      this.emitProgress(job.id, 10, 'Cloning repository');

      // Clone repository
      clonePath = this.githubService.getTempDir(job.id);
      await this.githubService.clone({
        repoUrl: job.repositoryUrl,
        targetDir: clonePath,
        branch: job.branch,
      });

      job.updateProgress(20);
      await this.analysisJobRepo.save(job);
      this.emitProgress(job.id, 20, 'Installing dependencies');

      // Find the directory with package.json (might be root or a subdirectory for monorepos)
      const projectInfo = this.findProjectDirectory(clonePath);
      console.log('Project directory info:', projectInfo);

      // Calculate relative project directory for storage (e.g., 'ui' for monorepos)
      const relativeProjectDir = projectInfo && projectInfo.path !== clonePath
        ? relative(clonePath, projectInfo.path)
        : null;
      console.log('Relative project directory:', relativeProjectDir);

      let coverageReport: { files: Array<{ path: string; linesCovered: number; linesTotal: number; percentage: number; uncoveredLines: number[] }>; totalCoverage: number };

      if (projectInfo) {
        const projectDir = projectInfo.path;

        // Detect package manager and install dependencies
        const packageManager = this.commandRunner.detectPackageManager(projectDir);
        const installResult = await this.commandRunner.installDependencies(projectDir, packageManager);

        if (installResult.exitCode !== 0) {
          console.warn('Dependency installation had issues:', installResult.stderr);
        }

        job.updateProgress(40);
        await this.analysisJobRepo.save(job);
        this.emitProgress(job.id, 40, 'Running tests with coverage');

        // Run tests with coverage from the project directory
        const testResult = await this.commandRunner.runTestsWithCoverage(
          projectDir,
          packageManager,
          projectInfo.hasTestScript
        );
        console.log(`Tests completed with exit code: ${testResult.exitCode}`);
        if (testResult.stdout) {
          console.log('Test stdout:', testResult.stdout.slice(-2000)); // Last 2000 chars
        }
        if (testResult.stderr) {
          console.log('Test stderr:', testResult.stderr.slice(-2000));
        }

        job.updateProgress(60);
        await this.analysisJobRepo.save(job);
        this.emitProgress(job.id, 60, 'Parsing coverage results');

        // Parse coverage output from the project directory
        coverageReport = await this.parseCoverageOutput(projectDir);
      } else {
        // No package.json found - skip tests and report all files as 0% coverage
        console.log('No package.json found, skipping test run');
        job.updateProgress(60);
        await this.analysisJobRepo.save(job);
        this.emitProgress(job.id, 60, 'No package.json found - scanning files');
        coverageReport = { files: [], totalCoverage: 0 };
      }

      // Find all .ts files and add missing ones with 0% coverage
      const allTsFiles = this.findAllTypeScriptFiles(clonePath);
      const coveredPaths = new Set(coverageReport.files.map(f => f.path));

      for (const tsFile of allTsFiles) {
        if (!coveredPaths.has(tsFile)) {
          coverageReport.files.push({
            path: tsFile,
            linesCovered: 0,
            linesTotal: 1,
            percentage: 0,
            uncoveredLines: [1],
          });
        }
      }

      // Recalculate total coverage
      const totalCovered = coverageReport.files.reduce((sum, f) => sum + f.linesCovered, 0);
      const totalLines = coverageReport.files.reduce((sum, f) => sum + f.linesTotal, 0);
      coverageReport.totalCoverage = totalLines > 0 ? Math.round((totalCovered / totalLines) * 100 * 100) / 100 : 0;
      coverageReport.files.sort((a, b) => a.percentage - b.percentage);

      job.updateProgress(80);
      await this.analysisJobRepo.save(job);
      this.emitProgress(job.id, 80, 'Storing coverage data');

      // Clear old coverage data
      await this.coverageFileRepo.deleteByRepositoryId(repository.id);

      // Store new coverage data
      const coverageThreshold = parseInt(process.env.COVERAGE_THRESHOLD || '80', 10);
      let filesBelowThreshold = 0;

      for (const fileReport of coverageReport.files) {
        const coverageFile = CoverageFile.create({
          repositoryId: repository.id,
          path: FilePath.create(fileReport.path),
          coveragePercentage: CoveragePercentage.create(fileReport.percentage),
          uncoveredLines: fileReport.uncoveredLines,
          projectDir: relativeProjectDir || undefined,
        });
        await this.coverageFileRepo.save(coverageFile);

        if (fileReport.percentage < coverageThreshold) {
          filesBelowThreshold++;
        }
      }

      // Update repository
      repository.markAsAnalyzed();
      await this.repoRepository.save(repository);

      // Complete job
      job.complete(coverageReport.files.length, filesBelowThreshold);
      await this.analysisJobRepo.save(job);
      this.emitProgress(job.id, 100, `Analysis complete: ${coverageReport.files.length} files, ${filesBelowThreshold} below threshold`);

      return job;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.fail(errorMessage);
      await this.analysisJobRepo.save(job);
      this.emitProgress(job.id, 0, `Failed: ${errorMessage}`);
      return job;
    } finally {
      if (clonePath) {
        await this.githubService.cleanupWorkDir(clonePath);
      }
    }
  }

  private async parseCoverageOutput(clonePath: string): Promise<{
    files: Array<{
      path: string;
      linesCovered: number;
      linesTotal: number;
      percentage: number;
      uncoveredLines: number[];
    }>;
    totalCoverage: number;
  }> {
    const coverageDir = join(clonePath, 'coverage');
    const { readdirSync } = await import('fs');

    // Log what's in the cloned repo root
    console.log('Cloned repo root contents:', readdirSync(clonePath));

    // Check for monorepo structure - coverage might be in a subdirectory
    const possibleCoveragePaths = [
      join(clonePath, 'coverage'),
      join(clonePath, 'backend', 'coverage'),
      join(clonePath, 'src', 'coverage'),
    ];

    for (const possiblePath of possibleCoveragePaths) {
      if (existsSync(possiblePath)) {
        console.log('Found coverage at:', possiblePath);
        console.log('Coverage directory contents:', readdirSync(possiblePath));
      }
    }

    // Log what's in the coverage directory
    if (existsSync(coverageDir)) {
      try {
        const files = readdirSync(coverageDir);
        console.log('Coverage directory contents:', files);
      } catch (e) {
        console.log('Could not read coverage directory');
      }
    } else {
      console.log('Coverage directory does not exist:', coverageDir);
    }

    // Set project root for path normalization
    this.coverageParser.setProjectRoot(clonePath);

    const istanbulPath = join(clonePath, 'coverage', 'coverage-final.json');
    if (existsSync(istanbulPath)) {
      console.log('Found istanbul coverage at:', istanbulPath);
      return this.coverageParser.parseIstanbulJson(istanbulPath);
    }

    const lcovPath = join(clonePath, 'coverage', 'lcov.info');
    if (existsSync(lcovPath)) {
      console.log('Found lcov coverage at:', lcovPath);
      return this.coverageParser.parseLcov(lcovPath);
    }

    console.warn('No coverage output found in', coverageDir);
    return { files: [], totalCoverage: 0 };
  }

  /**
   * Find the directory containing package.json.
   * Handles monorepos by checking common subdirectories.
   * Returns the project directory and whether it has a test script.
   */
  private findProjectDirectory(clonePath: string): { path: string; hasTestScript: boolean } | null {
    // Check if root has package.json
    const rootPackageJson = join(clonePath, 'package.json');
    if (existsSync(rootPackageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(rootPackageJson, 'utf-8'));
        console.log('Root package.json scripts:', pkg.scripts);
        const hasTestScript = !!pkg.scripts?.test;
        if (hasTestScript) {
          return { path: clonePath, hasTestScript: true };
        }
        // Root has package.json but no test script - check subdirs first
      } catch (e) {
        console.log('Invalid root package.json');
      }
    } else {
      console.log('No package.json at repo root');
    }

    // Common subdirectory patterns for monorepos
    const subdirs = [
      'ui',
      'frontend',
      'web',
      'client',
      'app',
      'backend',
      'server',
      'api',
      'src',
      'packages/app',
      'packages/web',
      'apps/web',
      'apps/frontend',
    ];

    // First pass: look for subdirs with test script
    for (const subdir of subdirs) {
      const subdirPath = join(clonePath, subdir);
      const packageJsonPath = join(subdirPath, 'package.json');

      if (existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          console.log(`${subdir}/package.json scripts:`, pkg.scripts);
          if (pkg.scripts?.test) {
            console.log(`Found test script in ${subdir}/package.json`);
            return { path: subdirPath, hasTestScript: true };
          }
        } catch (e) {
          console.log(`Invalid ${subdir}/package.json`);
        }
      }
    }

    // Second pass: return first subdir with package.json (even without test script)
    for (const subdir of subdirs) {
      const subdirPath = join(clonePath, subdir);
      const packageJsonPath = join(subdirPath, 'package.json');

      if (existsSync(packageJsonPath)) {
        console.log(`Using ${subdir} as project directory (no test script, will try npx)`);
        return { path: subdirPath, hasTestScript: false };
      }
    }

    // Fall back to root if it has package.json
    if (existsSync(rootPackageJson)) {
      console.log('Using root as project directory (no test script, will try npx)');
      return { path: clonePath, hasTestScript: false };
    }

    console.warn('No package.json found in repo');
    return null;
  }

  private findAllTypeScriptFiles(baseDir: string, relativePath: string = ''): string[] {
    const files: string[] = [];
    const fullPath = relativePath ? join(baseDir, relativePath) : baseDir;

    try {
      const entries = readdirSync(fullPath);

      for (const entry of entries) {
        const entryRelativePath = relativePath ? join(relativePath, entry) : entry;
        const entryFullPath = join(fullPath, entry);

        if (this.shouldSkipDirectory(entry)) {
          continue;
        }

        const stat = statSync(entryFullPath);

        if (stat.isDirectory()) {
          files.push(...this.findAllTypeScriptFiles(baseDir, entryRelativePath));
        } else if (this.isSourceTypeScriptFile(entry)) {
          files.push(entryRelativePath.replace(/\\/g, '/'));
        }
      }
    } catch (error) {
      console.warn(`Could not read directory: ${fullPath}`);
    }

    return files;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '__mocks__'];
    return skipDirs.includes(name);
  }

  private isSourceTypeScriptFile(filename: string): boolean {
    if (!filename.endsWith('.ts')) return false;
    if (filename.endsWith('.test.ts') || filename.endsWith('.spec.ts')) return false;
    if (filename.endsWith('.d.ts')) return false;
    return true;
  }

  private emitProgress(jobId: string, progress: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback(jobId, progress, message);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
