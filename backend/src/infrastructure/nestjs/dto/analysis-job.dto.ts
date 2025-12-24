import { AnalysisJobStatus } from '../../../domain/entities/AnalysisJob';

export class AnalysisJobResponseDto {
  id!: string;
  repositoryId!: string;
  repositoryUrl!: string;
  branch!: string;
  status!: AnalysisJobStatus;
  progress!: number;
  error!: string | null;
  filesFound!: number;
  filesBelowThreshold!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
