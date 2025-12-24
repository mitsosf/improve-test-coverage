import { JobStatus } from './JobStatus';

describe('JobStatus', () => {
  describe('factory methods', () => {
    it('should create pending status', () => {
      const status = JobStatus.pending();
      expect(status.value).toBe('pending');
      expect(status.isPending).toBe(true);
    });

    it('should create running status', () => {
      const status = JobStatus.running();
      expect(status.value).toBe('running');
      expect(status.isRunning).toBe(true);
    });

    it('should create completed status', () => {
      const status = JobStatus.completed();
      expect(status.value).toBe('completed');
      expect(status.isCompleted).toBe(true);
    });

    it('should create failed status', () => {
      const status = JobStatus.failed();
      expect(status.value).toBe('failed');
      expect(status.isFailed).toBe(true);
    });
  });

  describe('fromString', () => {
    it('should create from valid string', () => {
      const status = JobStatus.fromString('running');
      expect(status.isRunning).toBe(true);
    });

    it('should throw for invalid string', () => {
      expect(() => JobStatus.fromString('invalid')).toThrow('Invalid job status');
    });
  });

  describe('isTerminal', () => {
    it('should return true for completed', () => {
      expect(JobStatus.completed().isTerminal).toBe(true);
    });

    it('should return true for failed', () => {
      expect(JobStatus.failed().isTerminal).toBe(true);
    });

    it('should return false for pending', () => {
      expect(JobStatus.pending().isTerminal).toBe(false);
    });

    it('should return false for running', () => {
      expect(JobStatus.running().isTerminal).toBe(false);
    });
  });

  describe('canTransitionTo', () => {
    it('should allow pending -> running', () => {
      expect(JobStatus.pending().canTransitionTo(JobStatus.running())).toBe(true);
    });

    it('should allow running -> completed', () => {
      expect(JobStatus.running().canTransitionTo(JobStatus.completed())).toBe(true);
    });

    it('should allow running -> failed', () => {
      expect(JobStatus.running().canTransitionTo(JobStatus.failed())).toBe(true);
    });

    it('should not allow pending -> completed', () => {
      expect(JobStatus.pending().canTransitionTo(JobStatus.completed())).toBe(false);
    });

    it('should not allow completed -> anything', () => {
      expect(JobStatus.completed().canTransitionTo(JobStatus.running())).toBe(false);
    });
  });
});
