import { Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '../../persistence/sqlite/database';
import { SqliteGitHubRepoRepository } from '../../persistence/sqlite/GitHubRepoRepository';
import { SqliteCoverageFileRepository } from '../../persistence/sqlite/CoverageFileRepository';
import { SqliteJobRepository } from '../../persistence/sqlite/JobRepository';
import { SqliteAnalysisJobRepository } from '../../persistence/sqlite/AnalysisJobRepository';
import { GitHubService } from '../../github/GitHubService';
import { GitHubApiClient } from '../../github/GitHubApiClient';
import { CoverageParser } from '../../coverage/CoverageParser';
import { CommandRunner } from '../../runner/CommandRunner';
import { AiProviderFactory } from '../../ai/AiProviderFactory';
import { JobOrchestrator } from '../../../application/services/JobOrchestrator';
import { AnalysisJobProcessor } from '../../../application/services/AnalysisJobProcessor';
// Domain repository symbols
import { GITHUB_REPO_REPOSITORY } from '../../../domain/repositories/IGitHubRepoRepository';
import { COVERAGE_FILE_REPOSITORY } from '../../../domain/repositories/ICoverageFileRepository';
import { JOB_REPOSITORY } from '../../../domain/repositories/IJobRepository';
import { ANALYSIS_JOB_REPOSITORY } from '../../../domain/repositories/IAnalysisJobRepository';
// Domain port symbols
import { GITHUB_SERVICE } from '../../../domain/ports/IGitHubService';
import { GITHUB_API_CLIENT } from '../../../domain/ports/IGitHubApiClient';
import { COVERAGE_PARSER } from '../../../domain/ports/ICoverageParser';
import { COMMAND_RUNNER } from '../../../domain/ports/ICommandRunner';
import { AI_PROVIDER_FACTORY } from '../../../domain/ports/IAiProviderFactory';
import { RepositoriesController, JobsController, HealthController } from '../controllers';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const DATABASE_TOKEN = Symbol('DATABASE');

@Global()
@Module({
  controllers: [RepositoriesController, JobsController, HealthController],
  providers: [
    // Database
    {
      provide: DATABASE_TOKEN,
      useFactory: () => {
        const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'coverage.db');
        // Ensure data directory exists
        const dataDir = join(process.cwd(), 'data');
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }
        return createDatabase(dbPath);
      },
    },

    // Repositories (DDD ports implementation)
    {
      provide: GITHUB_REPO_REPOSITORY,
      useFactory: (db: Database.Database) => new SqliteGitHubRepoRepository(db),
      inject: [DATABASE_TOKEN],
    },
    {
      provide: COVERAGE_FILE_REPOSITORY,
      useFactory: (db: Database.Database) => new SqliteCoverageFileRepository(db),
      inject: [DATABASE_TOKEN],
    },
    {
      provide: JOB_REPOSITORY,
      useFactory: (db: Database.Database) => new SqliteJobRepository(db),
      inject: [DATABASE_TOKEN],
    },
    {
      provide: ANALYSIS_JOB_REPOSITORY,
      useFactory: (db: Database.Database) => new SqliteAnalysisJobRepository(db),
      inject: [DATABASE_TOKEN],
    },

    // Infrastructure services (implementing domain ports)
    {
      provide: GITHUB_SERVICE,
      useFactory: () => new GitHubService(),
    },
    {
      provide: GITHUB_API_CLIENT,
      useFactory: () => new GitHubApiClient(),
    },
    {
      provide: COVERAGE_PARSER,
      useFactory: () => new CoverageParser(),
    },
    {
      provide: COMMAND_RUNNER,
      useFactory: () => new CommandRunner(),
    },
    {
      provide: AI_PROVIDER_FACTORY,
      useFactory: () => new AiProviderFactory(),
    },

    // Application services
    {
      provide: JobOrchestrator,
      useFactory: (
        jobRepo: SqliteJobRepository,
        repoRepository: SqliteGitHubRepoRepository,
        coverageFileRepo: SqliteCoverageFileRepository,
        githubService: GitHubService,
        githubApiClient: GitHubApiClient,
        aiProviderFactory: AiProviderFactory,
        commandRunner: CommandRunner,
        coverageParser: CoverageParser,
      ) => new JobOrchestrator(
        jobRepo,
        repoRepository,
        coverageFileRepo,
        githubService,
        githubApiClient,
        aiProviderFactory,
        commandRunner,
        coverageParser,
      ),
      inject: [
        JOB_REPOSITORY,
        GITHUB_REPO_REPOSITORY,
        COVERAGE_FILE_REPOSITORY,
        GITHUB_SERVICE,
        GITHUB_API_CLIENT,
        AI_PROVIDER_FACTORY,
        COMMAND_RUNNER,
        COVERAGE_PARSER,
      ],
    },
    {
      provide: AnalysisJobProcessor,
      useFactory: (
        analysisJobRepo: SqliteAnalysisJobRepository,
        repoRepository: SqliteGitHubRepoRepository,
        coverageFileRepo: SqliteCoverageFileRepository,
        githubService: GitHubService,
        coverageParser: CoverageParser,
        commandRunner: CommandRunner,
      ) => new AnalysisJobProcessor(
        analysisJobRepo,
        repoRepository,
        coverageFileRepo,
        githubService,
        coverageParser,
        commandRunner,
      ),
      inject: [
        ANALYSIS_JOB_REPOSITORY,
        GITHUB_REPO_REPOSITORY,
        COVERAGE_FILE_REPOSITORY,
        GITHUB_SERVICE,
        COVERAGE_PARSER,
        COMMAND_RUNNER,
      ],
    },
  ],
  exports: [
    DATABASE_TOKEN,
    // Repository ports
    GITHUB_REPO_REPOSITORY,
    COVERAGE_FILE_REPOSITORY,
    JOB_REPOSITORY,
    ANALYSIS_JOB_REPOSITORY,
    // Service ports
    GITHUB_SERVICE,
    GITHUB_API_CLIENT,
    COVERAGE_PARSER,
    COMMAND_RUNNER,
    AI_PROVIDER_FACTORY,
    // Application services
    JobOrchestrator,
    AnalysisJobProcessor,
  ],
})
export class CoreModule implements OnModuleInit, OnModuleDestroy {
  private jobProcessorInterval?: ReturnType<typeof setInterval>;
  private analysisProcessorInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly jobOrchestrator: JobOrchestrator,
    private readonly analysisJobProcessor: AnalysisJobProcessor,
  ) {}

  async onModuleInit() {
    // Start job processors in background
    if (process.env.ENABLE_JOB_PROCESSOR !== 'false') {
      console.log('Starting job processors...');
      this.startJobProcessor();
      this.startAnalysisProcessor();
    }
  }

  onModuleDestroy() {
    if (this.jobProcessorInterval) {
      clearInterval(this.jobProcessorInterval);
    }
    if (this.analysisProcessorInterval) {
      clearInterval(this.analysisProcessorInterval);
    }
    this.jobOrchestrator.stopProcessing();
    this.analysisJobProcessor.stopProcessing();
  }

  private startJobProcessor() {
    // Process improvement jobs every 5 seconds
    this.jobProcessorInterval = setInterval(async () => {
      try {
        await this.jobOrchestrator.processNextJob();
      } catch (error) {
        console.error('Job processor error:', error);
      }
    }, 5000);
  }

  private startAnalysisProcessor() {
    // Process analysis jobs every 5 seconds
    this.analysisProcessorInterval = setInterval(async () => {
      try {
        await this.analysisJobProcessor.processNextJob();
      } catch (error) {
        console.error('Analysis processor error:', error);
      }
    }, 5000);
  }
}
