import { IJobRepository, ICoverageFileRepository } from '../../domain';

export interface CancelJobInput {
  jobId: string;
}

/**
 * Command to cancel a pending or running job.
 */
export class CancelJobCommand {
  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
  ) {}

  async execute(input: CancelJobInput): Promise<void> {
    const job = await this.jobRepo.findById(input.jobId);

    if (!job) {
      throw new Error(`Job not found: ${input.jobId}`);
    }

    if (job.status.value === 'completed' || job.status.value === 'failed') {
      throw new Error(`Cannot cancel job in ${job.status.value} state`);
    }

    // Mark job as failed with cancellation message
    job.fail('Job cancelled by user');
    await this.jobRepo.save(job);

    // Reset file status back to pending
    const coverageFile = await this.coverageFileRepo.findById(job.fileId);
    if (coverageFile) {
      coverageFile.resetToPending();
      await this.coverageFileRepo.save(coverageFile);
    }
  }
}
