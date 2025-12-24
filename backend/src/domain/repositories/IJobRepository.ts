import { ImprovementJob } from '../entities/ImprovementJob';

/**
 * Repository interface (port) for ImprovementJob entity persistence
 */
export interface IJobRepository {
  save(job: ImprovementJob): Promise<void>;
  findById(id: string): Promise<ImprovementJob | null>;
  findByRepositoryId(repositoryId: string): Promise<ImprovementJob[]>;
  findByFileId(fileId: string): Promise<ImprovementJob[]>;
  findPending(limit?: number): Promise<ImprovementJob[]>;
  findPendingByRepositoryId(repositoryId: string): Promise<ImprovementJob | null>;
  findRunning(): Promise<ImprovementJob[]>;
  findAll(): Promise<ImprovementJob[]>;
  delete(id: string): Promise<void>;
}

export const JOB_REPOSITORY = Symbol('IJobRepository');
