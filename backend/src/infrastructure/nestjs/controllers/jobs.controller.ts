import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Inject,
  Query,
} from '@nestjs/common';
import { CreateJobDto, JobResponseDto, JobListResponseDto } from '../dto';
import {
  IJobRepository,
  JOB_REPOSITORY,
  IGitHubRepoRepository,
  GITHUB_REPO_REPOSITORY,
  ICoverageFileRepository,
  COVERAGE_FILE_REPOSITORY,
} from '../../../domain';
import { StartImprovementJobCommand } from '../../../application/commands/StartImprovementJob';
import { CancelJobCommand } from '../../../application/commands/CancelJob';
import { GetJobStatusQuery } from '../../../application/queries/GetJobStatus';

@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(JOB_REPOSITORY)
    private readonly jobRepo: IJobRepository,
    @Inject(GITHUB_REPO_REPOSITORY)
    private readonly repoRepository: IGitHubRepoRepository,
    @Inject(COVERAGE_FILE_REPOSITORY)
    private readonly coverageFileRepo: ICoverageFileRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateJobDto): Promise<JobResponseDto> {
    const command = new StartImprovementJobCommand(this.jobRepo, this.coverageFileRepo);

    const result = await command.execute({
      repositoryId: dto.repositoryId,
      fileId: dto.fileId,
      aiProvider: dto.aiProvider,
    });

    const query = new GetJobStatusQuery(this.jobRepo, this.repoRepository, this.coverageFileRepo);
    return query.getById(result.job.id);
  }

  @Get()
  async findAll(@Query('repositoryId') repositoryId?: string): Promise<JobListResponseDto> {
    const query = new GetJobStatusQuery(this.jobRepo, this.repoRepository, this.coverageFileRepo);

    if (repositoryId) {
      return query.listByRepository(repositoryId);
    }

    return query.listAll();
  }

  @Get('pending')
  async findPending(@Query('limit') limit?: string): Promise<JobListResponseDto> {
    const query = new GetJobStatusQuery(this.jobRepo, this.repoRepository, this.coverageFileRepo);
    return query.listPending(limit ? parseInt(limit, 10) : 10);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<JobResponseDto> {
    const query = new GetJobStatusQuery(this.jobRepo, this.repoRepository, this.coverageFileRepo);

    try {
      return await query.getById(id);
    } catch (error) {
      throw new NotFoundException(`Job not found: ${id}`);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id') id: string): Promise<void> {
    const command = new CancelJobCommand(this.jobRepo, this.coverageFileRepo);

    try {
      await command.execute({ jobId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException(`Job not found: ${id}`);
      }
      throw error;
    }
  }
}
