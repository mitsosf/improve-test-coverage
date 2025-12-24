import { CoverageFile } from '../entities/CoverageFile';

/**
 * Repository interface (port) for CoverageFile entity persistence
 */
export interface ICoverageFileRepository {
  save(file: CoverageFile): Promise<void>;
  saveMany(files: CoverageFile[]): Promise<void>;
  findById(id: string): Promise<CoverageFile | null>;
  findByRepositoryId(repositoryId: string): Promise<CoverageFile[]>;
  findByPath(repositoryId: string, path: string): Promise<CoverageFile | null>;
  findBelowThreshold(repositoryId: string, threshold: number): Promise<CoverageFile[]>;
  delete(id: string): Promise<void>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
}

export const COVERAGE_FILE_REPOSITORY = Symbol('ICoverageFileRepository');
