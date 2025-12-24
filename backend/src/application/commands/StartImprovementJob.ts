import {
  ImprovementJob,
  AiProvider,
  IJobRepository,
  ICoverageFileRepository,
} from '../../domain';

export interface StartImprovementJobInput {
  repositoryId: string;
  fileId: string;
  aiProvider?: AiProvider;
}

export interface StartImprovementJobResult {
  job: ImprovementJob;
}

/**
 * Command to start a test improvement job for a specific file.
 * Creates a job entry and queues it for processing.
 */
export class StartImprovementJobCommand {
  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
  ) {}

  async execute(input: StartImprovementJobInput): Promise<StartImprovementJobResult> {
    // 1. Verify the file exists
    const coverageFile = await this.coverageFileRepo.findById(input.fileId);
    if (!coverageFile) {
      throw new Error(`Coverage file not found: ${input.fileId}`);
    }

    if (coverageFile.repositoryId !== input.repositoryId) {
      throw new Error('File does not belong to the specified repository');
    }

    // 2. Check if there's already a running job for this file
    const existingJobs = await this.jobRepo.findByFileId(input.fileId);
    const runningJob = existingJobs.find(j =>
      j.status.value === 'pending' || j.status.value === 'running'
    );

    if (runningJob) {
      throw new Error(`A job is already in progress for this file: ${runningJob.id}`);
    }

    // 3. Create new job
    const job = ImprovementJob.create({
      repositoryId: input.repositoryId,
      fileId: input.fileId,
      filePath: coverageFile.path.value,
      aiProvider: input.aiProvider || 'claude',
    });

    // 4. Save to repository (this queues it for processing)
    await this.jobRepo.save(job);

    // 5. Mark file as being improved
    coverageFile.markAsImproving();
    await this.coverageFileRepo.save(coverageFile);

    return { job };
  }
}
