import { ImprovementJob } from '../../../domain/entities/ImprovementJob';
import { GitHubRepo } from '../../../domain/entities/GitHubRepo';
import { CoverageFile } from '../../../domain/entities/CoverageFile';
import { CoveragePercentage } from '../../../domain/value-objects/CoveragePercentage';
import { FilePath } from '../../../domain/value-objects/FilePath';
import { GitHubPrUrl } from '../../../domain/value-objects/GitHubPrUrl';
import { createTestDatabase } from './database';
import { SqliteJobRepository } from './JobRepository';
import { SqliteGitHubRepoRepository } from './GitHubRepoRepository';
import { SqliteCoverageFileRepository } from './CoverageFileRepository';

describe('SqliteJobRepository', () => {
  let jobRepo: SqliteJobRepository;
  let repoRepo: SqliteGitHubRepoRepository;
  let fileRepo: SqliteCoverageFileRepository;
  let testRepo: GitHubRepo;
  let testFile: CoverageFile;

  beforeEach(async () => {
    const db = createTestDatabase();
    jobRepo = new SqliteJobRepository(db);
    repoRepo = new SqliteGitHubRepoRepository(db);
    fileRepo = new SqliteCoverageFileRepository(db);

    // Create test repository and file
    testRepo = GitHubRepo.create({
      url: 'https://github.com/user/repo',
      owner: 'user',
      name: 'repo',
      defaultBranch: 'main',
    });
    await repoRepo.save(testRepo);

    testFile = CoverageFile.create({
      repositoryId: testRepo.id,
      path: FilePath.create('src/utils.ts'),
      coveragePercentage: CoveragePercentage.create(50),
      uncoveredLines: [10, 20, 30],
    });
    await fileRepo.save(testFile);
  });

  describe('save and findById', () => {
    it('should save and retrieve a job', async () => {
      const job = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/utils.ts',
        aiProvider: 'claude',
      });

      await jobRepo.save(job);
      const found = await jobRepo.findById(job.id);

      expect(found).not.toBeNull();
      expect(found!.repositoryId).toBe(testRepo.id);
      expect(found!.aiProvider).toBe('claude');
      expect(found!.status.isPending).toBe(true);
    });

    it('should update job status', async () => {
      const job = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/utils.ts',
        aiProvider: 'claude',
      });

      await jobRepo.save(job);
      job.start();
      job.updateProgress(50);
      await jobRepo.save(job);

      const found = await jobRepo.findById(job.id);
      expect(found!.status.isRunning).toBe(true);
      expect(found!.progress).toBe(50);
    });

    it('should save completed job with PR URL', async () => {
      const job = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/utils.ts',
        aiProvider: 'claude',
      });

      await jobRepo.save(job);
      job.start();
      job.complete(GitHubPrUrl.create('https://github.com/user/repo/pull/123'));
      await jobRepo.save(job);

      const found = await jobRepo.findById(job.id);
      expect(found!.status.isCompleted).toBe(true);
      expect(found!.prUrl?.value).toBe('https://github.com/user/repo/pull/123');
    });
  });

  describe('findPending', () => {
    it('should return pending jobs', async () => {
      const job1 = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/utils.ts',
        aiProvider: 'claude',
      });
      const job2 = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/other.ts',
        aiProvider: 'openai',
      });

      await jobRepo.save(job1);
      await jobRepo.save(job2);
      job2.start();
      await jobRepo.save(job2);

      const pending = await jobRepo.findPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(job1.id);
    });
  });

  describe('findPendingByRepositoryId', () => {
    it('should return active job for repository', async () => {
      const job = ImprovementJob.create({
        repositoryId: testRepo.id,
        fileId: testFile.id,
        filePath: 'src/utils.ts',
        aiProvider: 'claude',
      });

      await jobRepo.save(job);
      const found = await jobRepo.findPendingByRepositoryId(testRepo.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(job.id);
    });

    it('should return null when no active job', async () => {
      const found = await jobRepo.findPendingByRepositoryId(testRepo.id);
      expect(found).toBeNull();
    });
  });
});
