import { ImprovementJob } from './ImprovementJob';
import { GitHubPrUrl } from '../value-objects/GitHubPrUrl';

describe('ImprovementJob', () => {
  const createJob = () =>
    ImprovementJob.create({
      repositoryId: 'repo-123',
      fileId: 'file-456',
      filePath: 'src/utils.ts',
      aiProvider: 'claude',
    });

  describe('create', () => {
    it('should create a job with pending status', () => {
      const job = createJob();

      expect(job.repositoryId).toBe('repo-123');
      expect(job.fileId).toBe('file-456');
      expect(job.filePath).toBe('src/utils.ts');
      expect(job.aiProvider).toBe('claude');
      expect(job.status.isPending).toBe(true);
      expect(job.progress).toBe(0);
      expect(job.prUrl).toBeNull();
      expect(job.error).toBeNull();
    });
  });

  describe('state machine', () => {
    it('should transition from pending to running', () => {
      const job = createJob();
      job.start();

      expect(job.status.isRunning).toBe(true);
      expect(job.progress).toBe(0);
    });

    it('should update progress while running', () => {
      const job = createJob();
      job.start();
      job.updateProgress(50);

      expect(job.progress).toBe(50);
    });

    it('should transition from running to completed', () => {
      const job = createJob();
      job.start();
      const prUrl = GitHubPrUrl.create('https://github.com/user/repo/pull/123');
      job.complete(prUrl);

      expect(job.status.isCompleted).toBe(true);
      expect(job.progress).toBe(100);
      expect(job.prUrl).toBe(prUrl);
    });

    it('should transition from running to failed', () => {
      const job = createJob();
      job.start();
      job.fail('Something went wrong');

      expect(job.status.isFailed).toBe(true);
      expect(job.error).toBe('Something went wrong');
    });

    it('should throw when transitioning from pending to completed', () => {
      const job = createJob();
      const prUrl = GitHubPrUrl.create('https://github.com/user/repo/pull/123');

      expect(() => job.complete(prUrl)).toThrow('Invalid status transition');
    });

    it('should throw when updating progress on non-running job', () => {
      const job = createJob();

      expect(() => job.updateProgress(50)).toThrow('Cannot update progress for non-running job');
    });
  });
});
