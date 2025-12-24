import Database from 'better-sqlite3';
import { GitHubRepo } from '../../../domain/entities/GitHubRepo';
import { IGitHubRepoRepository } from '../../../domain/repositories/IGitHubRepoRepository';
import { getDatabase } from './database';

interface GitHubRepoRow {
  id: string;
  url: string;
  owner: string;
  name: string;
  default_branch: string;
  last_analyzed_at: string | null;
  created_at: string;
}

export class SqliteGitHubRepoRepository implements IGitHubRepoRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  async save(repo: GitHubRepo): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO repositories (id, url, owner, name, default_branch, last_analyzed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        owner = excluded.owner,
        name = excluded.name,
        default_branch = excluded.default_branch,
        last_analyzed_at = excluded.last_analyzed_at
    `);

    stmt.run(
      repo.id,
      repo.url,
      repo.owner,
      repo.name,
      repo.defaultBranch,
      repo.lastAnalyzedAt?.toISOString() || null,
      repo.createdAt.toISOString(),
    );
  }

  async findById(id: string): Promise<GitHubRepo | null> {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = ?');
    const row = stmt.get(id) as GitHubRepoRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findByUrl(url: string): Promise<GitHubRepo | null> {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE url = ?');
    const row = stmt.get(url) as GitHubRepoRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findAll(): Promise<GitHubRepo[]> {
    const stmt = this.db.prepare('SELECT * FROM repositories ORDER BY created_at DESC');
    const rows = stmt.all() as GitHubRepoRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM repositories WHERE id = ?');
    stmt.run(id);
  }

  private mapToEntity(row: GitHubRepoRow): GitHubRepo {
    return GitHubRepo.reconstitute({
      id: row.id,
      url: row.url,
      owner: row.owner,
      name: row.name,
      defaultBranch: row.default_branch,
      lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at) : null,
      createdAt: new Date(row.created_at),
    });
  }
}
