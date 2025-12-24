import Database from 'better-sqlite3';
import { ImprovementJob, AiProvider } from '../../../domain/entities/ImprovementJob';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { JobStatus } from '../../../domain/value-objects/JobStatus';
import { GitHubPrUrl } from '../../../domain/value-objects/GitHubPrUrl';
import { getDatabase } from './database';

interface JobRow {
  id: string;
  repository_id: string;
  file_id: string;
  file_path: string;
  status: string;
  ai_provider: string;
  progress: number;
  pr_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteJobRepository implements IJobRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  async save(job: ImprovementJob): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO improvement_jobs (id, repository_id, file_id, file_path, status, ai_provider, progress, pr_url, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        pr_url = excluded.pr_url,
        error = excluded.error,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      job.id,
      job.repositoryId,
      job.fileId,
      job.filePath,
      job.status.value,
      job.aiProvider,
      job.progress,
      job.prUrl?.value || null,
      job.error,
      job.createdAt.toISOString(),
      job.updatedAt.toISOString(),
    );
  }

  async findById(id: string): Promise<ImprovementJob | null> {
    const stmt = this.db.prepare('SELECT * FROM improvement_jobs WHERE id = ?');
    const row = stmt.get(id) as JobRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findByRepositoryId(repositoryId: string): Promise<ImprovementJob[]> {
    const stmt = this.db.prepare('SELECT * FROM improvement_jobs WHERE repository_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(repositoryId) as JobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findByFileId(fileId: string): Promise<ImprovementJob[]> {
    const stmt = this.db.prepare('SELECT * FROM improvement_jobs WHERE file_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(fileId) as JobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findPending(limit?: number): Promise<ImprovementJob[]> {
    const sql = limit
      ? `SELECT * FROM improvement_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ${limit}`
      : "SELECT * FROM improvement_jobs WHERE status = 'pending' ORDER BY created_at ASC";
    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as JobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findPendingByRepositoryId(repositoryId: string): Promise<ImprovementJob | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM improvement_jobs
      WHERE repository_id = ? AND status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT 1
    `);
    const row = stmt.get(repositoryId) as JobRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findRunning(): Promise<ImprovementJob[]> {
    const stmt = this.db.prepare("SELECT * FROM improvement_jobs WHERE status = 'running' ORDER BY created_at ASC");
    const rows = stmt.all() as JobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findAll(): Promise<ImprovementJob[]> {
    const stmt = this.db.prepare('SELECT * FROM improvement_jobs ORDER BY created_at DESC');
    const rows = stmt.all() as JobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM improvement_jobs WHERE id = ?');
    stmt.run(id);
  }

  private mapToEntity(row: JobRow): ImprovementJob {
    return ImprovementJob.reconstitute({
      id: row.id,
      repositoryId: row.repository_id,
      fileId: row.file_id,
      filePath: row.file_path,
      status: JobStatus.fromString(row.status),
      aiProvider: row.ai_provider as AiProvider,
      progress: row.progress,
      prUrl: row.pr_url ? GitHubPrUrl.create(row.pr_url) : null,
      error: row.error,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
