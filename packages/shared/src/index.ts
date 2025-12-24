// Repository DTOs
export interface RepositoryDto {
  id: string;
  url: string;
  name: string;
  defaultBranch: string;
  lastAnalyzedAt: Date | null;
  createdAt: Date;
}

export interface CreateRepositoryRequest {
  url: string;
  branch?: string;
}

export interface AnalyzeRepositoryRequest {
  branch?: string;
}

export interface BranchesDto {
  branches: string[];
  defaultBranch: string;
}

// Coverage DTOs
export interface CoverageFileDto {
  id: string;
  path: string;
  coveragePercentage: number;
  uncoveredLines: number[];
  status: 'pending' | 'improving' | 'improved';
  projectDir: string | null; // Relative path to project directory for monorepos (e.g., 'ui/')
}

export interface CoverageReportDto {
  repository: RepositoryDto;
  files: CoverageFileDto[];
  summary: {
    totalFiles: number;
    averageCoverage: number;
    filesBelowThreshold: number;
  };
}

// Job DTOs
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AiProvider = 'claude' | 'openai';

export interface JobDto {
  id: string;
  repositoryId: string;
  repositoryName: string;
  fileId: string;
  filePath: string;
  status: JobStatus;
  progress: number;
  aiProvider: AiProvider;
  prUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobRequest {
  repositoryId: string;
  fileId: string;
  aiProvider?: AiProvider;
}

export interface JobListDto {
  jobs: JobDto[];
  total: number;
}

// Analysis Job DTOs
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisJobDto {
  id: string;
  repositoryId: string;
  repositoryUrl: string;
  branch: string;
  status: AnalysisJobStatus;
  progress: number;
  error: string | null;
  filesFound: number;
  filesBelowThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

// API Response wrapper
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

// WebSocket events
export interface JobProgressEvent {
  jobId: string;
  progress: number;
  message: string;
}

export interface JobCompletedEvent {
  jobId: string;
  prUrl: string;
}

export interface JobFailedEvent {
  jobId: string;
  error: string;
}
