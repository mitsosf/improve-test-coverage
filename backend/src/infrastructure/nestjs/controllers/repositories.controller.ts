import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CreateRepositoryDto, AnalyzeRepositoryDto, RepositoryResponseDto, BranchResponseDto, AnalysisJobResponseDto } from '../dto';
import { CoverageReportResponseDto } from '../dto';
import {
  IGitHubRepoRepository,
  GITHUB_REPO_REPOSITORY,
  ICoverageFileRepository,
  COVERAGE_FILE_REPOSITORY,
  IAnalysisJobRepository,
  ANALYSIS_JOB_REPOSITORY,
  IGitHubService,
  GITHUB_SERVICE,
  IGitHubApiClient,
  GITHUB_API_CLIENT,
  ICoverageParser,
  COVERAGE_PARSER,
  GitHubRepo,
  AnalysisJob,
} from '../../../domain';
import { GetCoverageReportQuery } from '../../../application/queries/GetCoverageReport';

@Controller('repositories')
export class RepositoriesController {
  constructor(
    @Inject(GITHUB_REPO_REPOSITORY)
    private readonly repoRepository: IGitHubRepoRepository,
    @Inject(COVERAGE_FILE_REPOSITORY)
    private readonly coverageFileRepo: ICoverageFileRepository,
    @Inject(ANALYSIS_JOB_REPOSITORY)
    private readonly analysisJobRepo: IAnalysisJobRepository,
    @Inject(GITHUB_SERVICE)
    private readonly githubService: IGitHubService,
    @Inject(GITHUB_API_CLIENT)
    private readonly githubApiClient: IGitHubApiClient,
    @Inject(COVERAGE_PARSER)
    private readonly coverageParser: ICoverageParser,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRepositoryDto): Promise<RepositoryResponseDto> {
    // Check if repository already exists
    let repository = await this.repoRepository.findByUrl(dto.url);

    if (!repository) {
      const { owner, name } = GitHubRepo.fromGitHubUrl(dto.url);
      repository = GitHubRepo.create({
        url: dto.url,
        owner,
        name,
        defaultBranch: dto.branch || 'main',
      });
      await this.repoRepository.save(repository);
    }

    return this.toResponse(repository);
  }

  @Get()
  async findAll(): Promise<RepositoryResponseDto[]> {
    const repositories = await this.repoRepository.findAll();
    return repositories.map(r => this.toResponse(r));
  }

  @Get('branches')
  async getBranches(@Query('url') url: string): Promise<BranchResponseDto> {
    if (!url) {
      throw new BadRequestException('URL query parameter is required');
    }

    try {
      const { owner, name } = GitHubRepo.fromGitHubUrl(url);
      const branches = await this.githubApiClient.listBranches(owner, name);

      // Sort branches: default first, then alphabetically
      branches.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });

      const defaultBranch = branches.find(b => b.isDefault)?.name || 'main';

      return {
        branches: branches.map(b => b.name),
        defaultBranch,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid GitHub URL')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<RepositoryResponseDto> {
    const repository = await this.repoRepository.findById(id);
    if (!repository) {
      throw new NotFoundException(`Repository not found: ${id}`);
    }
    return this.toResponse(repository);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    const repository = await this.repoRepository.findById(id);
    if (!repository) {
      throw new NotFoundException(`Repository not found: ${id}`);
    }

    // Delete associated coverage files
    await this.coverageFileRepo.deleteByRepositoryId(id);

    await this.repoRepository.delete(id);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyze(
    @Param('id') id: string,
    @Body() dto: AnalyzeRepositoryDto,
  ): Promise<AnalysisJobResponseDto> {
    const repository = await this.repoRepository.findById(id);
    if (!repository) {
      throw new NotFoundException(`Repository not found: ${id}`);
    }

    // Check if there's already a pending or running analysis for this repo
    const existingJobs = await this.analysisJobRepo.findByRepositoryId(id);
    const activeJob = existingJobs.find(j => j.status === 'pending' || j.status === 'running');
    if (activeJob) {
      return this.toAnalysisJobResponse(activeJob);
    }

    // Create a new analysis job
    const job = AnalysisJob.create({
      repositoryId: repository.id,
      repositoryUrl: repository.url,
      branch: dto.branch || repository.defaultBranch,
    });

    await this.analysisJobRepo.save(job);

    return this.toAnalysisJobResponse(job);
  }

  @Get(':id/analysis/:jobId')
  async getAnalysisJob(
    @Param('id') repoId: string,
    @Param('jobId') jobId: string,
  ): Promise<AnalysisJobResponseDto> {
    const job = await this.analysisJobRepo.findById(jobId);
    if (!job || job.repositoryId !== repoId) {
      throw new NotFoundException(`Analysis job not found: ${jobId}`);
    }
    return this.toAnalysisJobResponse(job);
  }

  @Get(':id/analysis')
  async getLatestAnalysisJob(
    @Param('id') repoId: string,
  ): Promise<AnalysisJobResponseDto | null> {
    const job = await this.analysisJobRepo.findLatestByRepositoryId(repoId);
    if (!job) {
      return null;
    }
    return this.toAnalysisJobResponse(job);
  }

  @Get(':id/coverage')
  async getCoverage(@Param('id') id: string): Promise<CoverageReportResponseDto> {
    const repository = await this.repoRepository.findById(id);
    if (!repository) {
      throw new NotFoundException(`Repository not found: ${id}`);
    }

    const query = new GetCoverageReportQuery(this.repoRepository, this.coverageFileRepo);
    return query.execute(id);
  }

  private toResponse(repository: GitHubRepo): RepositoryResponseDto {
    return {
      id: repository.id,
      url: repository.url,
      name: repository.fullName,
      defaultBranch: repository.defaultBranch,
      lastAnalyzedAt: repository.lastAnalyzedAt,
      createdAt: repository.createdAt,
    };
  }

  private toAnalysisJobResponse(job: AnalysisJob): AnalysisJobResponseDto {
    return {
      id: job.id,
      repositoryId: job.repositoryId,
      repositoryUrl: job.repositoryUrl,
      branch: job.branch,
      status: job.status,
      progress: job.progress,
      error: job.error,
      filesFound: job.filesFound,
      filesBelowThreshold: job.filesBelowThreshold,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
