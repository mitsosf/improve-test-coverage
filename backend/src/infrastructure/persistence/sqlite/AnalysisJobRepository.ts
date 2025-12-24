import Database from 'better-sqlite3';
import { AnalysisJob, AnalysisJobStatus } from '../../../domain/entities/AnalysisJob';
import { IAnalysisJobRepository } from '../../../domain/repositories/IAnalysisJobRepository';
import { getDatabase } from './database';

interface AnalysisJobRow {
  id: string;
  repository_id: string;
  repository_url: string;
  branch: string;
  status: string;
  progress: number;
  error: string | null;
  files_found: number;
  files_below_threshold: number;
  created_at: string;
  updated_at: string;
}

export class SqliteAnalysisJobRepository implements IAnalysisJobRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  async save(job: AnalysisJob): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO analysis_jobs (id, repository_id, repository_url, branch, status, progress, error, files_found, files_below_threshold, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        error = excluded.error,
        files_found = excluded.files_found,
        files_below_threshold = excluded.files_below_threshold,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      job.id,
      job.repositoryId,
      job.repositoryUrl,
      job.branch,
      job.status,
      job.progress,
      job.error,
      job.filesFound,
      job.filesBelowThreshold,
      job.createdAt.toISOString(),
      job.updatedAt.toISOString(),
    );
  }

  async findById(id: string): Promise<AnalysisJob | null> {
    const stmt = this.db.prepare('SELECT * FROM analysis_jobs WHERE id = ?');
    const row = stmt.get(id) as AnalysisJobRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findByRepositoryId(repositoryId: string): Promise<AnalysisJob[]> {
    const stmt = this.db.prepare('SELECT * FROM analysis_jobs WHERE repository_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(repositoryId) as AnalysisJobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findPending(limit?: number): Promise<AnalysisJob[]> {
    const sql = limit
      ? `SELECT * FROM analysis_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ${limit}`
      : "SELECT * FROM analysis_jobs WHERE status = 'pending' ORDER BY created_at ASC";
    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as AnalysisJobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findLatestByRepositoryId(repositoryId: string): Promise<AnalysisJob | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM analysis_jobs
      WHERE repository_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(repositoryId) as AnalysisJobRow | undefined;
    return row ? this.mapToEntity(row) : null;
  }

  async findRunning(): Promise<AnalysisJob[]> {
    const stmt = this.db.prepare("SELECT * FROM analysis_jobs WHERE status = 'running' ORDER BY created_at ASC");
    const rows = stmt.all() as AnalysisJobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async findAll(): Promise<AnalysisJob[]> {
    const stmt = this.db.prepare('SELECT * FROM analysis_jobs ORDER BY created_at DESC');
    const rows = stmt.all() as AnalysisJobRow[];
    return rows.map((row) => this.mapToEntity(row));
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM analysis_jobs WHERE id = ?');
    stmt.run(id);
  }

  private mapToEntity(row: AnalysisJobRow): AnalysisJob {
    return AnalysisJob.reconstitute({
      id: row.id,
      repositoryId: row.repository_id,
      repositoryUrl: row.repository_url,
      branch: row.branch,
      status: row.status as AnalysisJobStatus,
      progress: row.progress,
      error: row.error,
      filesFound: row.files_found,
      filesBelowThreshold: row.files_below_threshold,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
