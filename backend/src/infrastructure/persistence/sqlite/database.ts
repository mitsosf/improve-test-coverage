import Database from 'better-sqlite3';
import { join } from 'path';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'coverage.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      last_analyzed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coverage_files (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      path TEXT NOT NULL,
      coverage_percentage REAL NOT NULL,
      uncovered_lines TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      project_dir TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
      UNIQUE(repository_id, path)
    );

    CREATE TABLE IF NOT EXISTS improvement_jobs (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ai_provider TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      pr_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES coverage_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      repository_url TEXT NOT NULL,
      branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      files_found INTEGER NOT NULL DEFAULT 0,
      files_below_threshold INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_coverage_files_repository ON coverage_files(repository_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_files_status ON coverage_files(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_repository ON improvement_jobs(repository_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON improvement_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_analysis_jobs_repository ON analysis_jobs(repository_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
  `);

  // Migration: Add project_dir column if it doesn't exist (for existing databases)
  const columns = database.prepare("PRAGMA table_info(coverage_files)").all() as Array<{ name: string }>;
  const hasProjectDir = columns.some(col => col.name === 'project_dir');
  if (!hasProjectDir) {
    database.exec('ALTER TABLE coverage_files ADD COLUMN project_dir TEXT');
  }
}

/**
 * Create a new database connection at the specified path
 */
export function createDatabase(dbPath: string): Database.Database {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  initializeSchema(database);
  return database;
}

// For testing purposes
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  initializeSchema(testDb);
  return testDb;
}
