import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';
import { AiProvider } from '../../../domain/entities/ImprovementJob';

export class CreateJobDto {
  @IsUUID()
  repositoryId!: string;

  @IsUUID()
  fileId!: string;

  @IsEnum(['claude', 'openai'])
  @IsOptional()
  aiProvider?: AiProvider;
}

export class JobResponseDto {
  id!: string;
  repositoryId!: string;
  repositoryName!: string;
  fileId!: string;
  filePath!: string;
  status!: string;
  aiProvider!: string;
  progress!: number;
  prUrl!: string | null;
  error!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class JobListResponseDto {
  jobs!: JobResponseDto[];
  total!: number;
}
