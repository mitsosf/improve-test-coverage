import { GitHubRepo } from '../entities/GitHubRepo';

/**
 * Repository interface (port) for GitHubRepo entity persistence
 */
export interface IGitHubRepoRepository {
  save(repo: GitHubRepo): Promise<void>;
  findById(id: string): Promise<GitHubRepo | null>;
  findByUrl(url: string): Promise<GitHubRepo | null>;
  findAll(): Promise<GitHubRepo[]>;
  delete(id: string): Promise<void>;
}

export const GITHUB_REPO_REPOSITORY = Symbol('IGitHubRepoRepository');
