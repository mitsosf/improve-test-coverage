import { AnalysisJob } from '../entities/AnalysisJob';

/**
 * Repository interface (port) for AnalysisJob entity persistence
 */
export interface IAnalysisJobRepository {
  save(job: AnalysisJob): Promise<void>;
  findById(id: string): Promise<AnalysisJob | null>;
  findByRepositoryId(repositoryId: string): Promise<AnalysisJob[]>;
  findPending(limit?: number): Promise<AnalysisJob[]>;
  findLatestByRepositoryId(repositoryId: string): Promise<AnalysisJob | null>;
  findRunning(): Promise<AnalysisJob[]>;
  findAll(): Promise<AnalysisJob[]>;
  delete(id: string): Promise<void>;
}

export const ANALYSIS_JOB_REPOSITORY = Symbol('IAnalysisJobRepository');
