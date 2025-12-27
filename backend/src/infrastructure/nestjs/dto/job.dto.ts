import { IsUUID, IsOptional, IsEnum, IsArray, ArrayMinSize } from 'class-validator';
import type { AiProvider } from '@coverage-improver/shared';

// Request DTO with validation (stays in backend)
export class CreateJobDto {
  @IsUUID()
  repositoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  fileIds!: string[];

  @IsEnum(['claude', 'openai'])
  @IsOptional()
  aiProvider?: AiProvider;
}

// Re-export response types from shared
export type {
  JobDto as JobResponseDto,
  JobListDto as JobListResponseDto,
  JobStatus,
  AiProvider,
} from '@coverage-improver/shared';
