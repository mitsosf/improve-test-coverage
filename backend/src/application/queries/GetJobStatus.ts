import {
  IJobRepository,
  IGitHubRepoRepository,
  ICoverageFileRepository,
} from '../../domain';

export interface JobStatusResult {
  id: string;
  repositoryId: string;
  repositoryName: string;
  fileId: string;
  filePath: string;
  status: string;
  aiProvider: string;
  progress: number;
  prUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobListResult {
  jobs: JobStatusResult[];
  total: number;
}

/**
 * Query to get job status and list jobs
 */
export class GetJobStatusQuery {
  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly repoRepository: IGitHubRepoRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
  ) {}

  async getById(jobId: string): Promise<JobStatusResult> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const repository = await this.repoRepository.findById(job.repositoryId);
    const file = await this.coverageFileRepo.findById(job.fileId);

    return {
      id: job.id,
      repositoryId: job.repositoryId,
      repositoryName: repository?.name || 'Unknown',
      fileId: job.fileId,
      filePath: file?.path.value || 'Unknown',
      status: job.status.value,
      aiProvider: job.aiProvider,
      progress: job.progress,
      prUrl: job.prUrl?.value || null,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async listByRepository(repositoryId: string): Promise<JobListResult> {
    const jobs = await this.jobRepo.findByRepositoryId(repositoryId);
    const repository = await this.repoRepository.findById(repositoryId);

    const results = await Promise.all(
      jobs.map(async job => {
        const file = await this.coverageFileRepo.findById(job.fileId);
        return {
          id: job.id,
          repositoryId: job.repositoryId,
          repositoryName: repository?.name || 'Unknown',
          fileId: job.fileId,
          filePath: file?.path.value || 'Unknown',
          status: job.status.value,
          aiProvider: job.aiProvider,
          progress: job.progress,
          prUrl: job.prUrl?.value || null,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      })
    );

    return {
      jobs: results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      total: results.length,
    };
  }

  async listPending(limit: number = 10): Promise<JobListResult> {
    const jobs = await this.jobRepo.findPending(limit);

    const results = await Promise.all(
      jobs.map(async job => {
        const repository = await this.repoRepository.findById(job.repositoryId);
        const file = await this.coverageFileRepo.findById(job.fileId);
        return {
          id: job.id,
          repositoryId: job.repositoryId,
          repositoryName: repository?.name || 'Unknown',
          fileId: job.fileId,
          filePath: file?.path.value || 'Unknown',
          status: job.status.value,
          aiProvider: job.aiProvider,
          progress: job.progress,
          prUrl: job.prUrl?.value || null,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      })
    );

    return {
      jobs: results,
      total: results.length,
    };
  }

  async listAll(): Promise<JobListResult> {
    const jobs = await this.jobRepo.findAll();

    const results = await Promise.all(
      jobs.map(async job => {
        const repository = await this.repoRepository.findById(job.repositoryId);
        const file = await this.coverageFileRepo.findById(job.fileId);
        return {
          id: job.id,
          repositoryId: job.repositoryId,
          repositoryName: repository?.name || 'Unknown',
          fileId: job.fileId,
          filePath: file?.path.value || 'Unknown',
          status: job.status.value,
          aiProvider: job.aiProvider,
          progress: job.progress,
          prUrl: job.prUrl?.value || null,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      })
    );

    return {
      jobs: results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      total: results.length,
    };
  }
}
