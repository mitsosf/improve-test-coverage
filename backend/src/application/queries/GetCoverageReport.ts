import {
  CoverageFile,
  IGitHubRepoRepository,
  ICoverageFileRepository,
} from '../../domain';

export interface CoverageReportFile {
  id: string;
  path: string;
  coveragePercentage: number;
  uncoveredLines: number[];
  status: string;
  projectDir: string | null;
  needsImprovement: boolean;
}

export interface CoverageReportResult {
  repository: {
    id: string;
    name: string;
    url: string;
    defaultBranch: string;
    lastAnalyzedAt: Date | null;
  };
  summary: {
    totalFiles: number;
    averageCoverage: number;
    filesBelowThreshold: number;
    filesImproving: number;
    filesImproved: number;
  };
  files: CoverageReportFile[];
}

/**
 * Query to get coverage report for a repository
 */
export class GetCoverageReportQuery {
  constructor(
    private readonly repoRepository: IGitHubRepoRepository,
    private readonly coverageFileRepo: ICoverageFileRepository,
  ) {}

  async execute(repositoryId: string, threshold: number = 80): Promise<CoverageReportResult> {
    const repository = await this.repoRepository.findById(repositoryId);
    if (!repository) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    const files = await this.coverageFileRepo.findByRepositoryId(repositoryId);

    // Sort by coverage percentage (lowest first)
    const sortedFiles = [...files].sort(
      (a, b) => a.coveragePercentage.value - b.coveragePercentage.value
    );

    const fileResults: CoverageReportFile[] = sortedFiles.map(f => ({
      id: f.id,
      path: f.path.value,
      coveragePercentage: f.coveragePercentage.value,
      uncoveredLines: f.uncoveredLines,
      status: f.status,
      projectDir: f.projectDir,
      needsImprovement: f.needsImprovement(threshold),
    }));

    const summary = {
      totalFiles: files.length,
      averageCoverage: this.calculateAverageCoverage(files),
      filesBelowThreshold: files.filter(f => f.coveragePercentage.value < threshold).length,
      filesImproving: files.filter(f => f.status === 'improving').length,
      filesImproved: files.filter(f => f.status === 'improved').length,
    };

    return {
      repository: {
        id: repository.id,
        name: repository.name,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
        lastAnalyzedAt: repository.lastAnalyzedAt,
      },
      summary,
      files: fileResults,
    };
  }

  private calculateAverageCoverage(files: CoverageFile[]): number {
    if (files.length === 0) return 0;
    const sum = files.reduce((acc, f) => acc + f.coveragePercentage.value, 0);
    return Math.round(sum / files.length);
  }
}
