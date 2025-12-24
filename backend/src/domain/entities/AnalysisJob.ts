import { v4 as uuidv4 } from 'uuid';

export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisJobProps {
  id?: string;
  repositoryId: string;
  repositoryUrl: string;
  branch: string;
  status?: AnalysisJobStatus;
  progress?: number;
  error?: string | null;
  filesFound?: number;
  filesBelowThreshold?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Entity representing a background job to analyze test coverage for a repository.
 * Clones the repo, runs tests with coverage, and stores results.
 */
export class AnalysisJob {
  private readonly _id: string;
  private readonly _repositoryId: string;
  private readonly _repositoryUrl: string;
  private readonly _branch: string;
  private _status: AnalysisJobStatus;
  private _progress: number;
  private _error: string | null;
  private _filesFound: number;
  private _filesBelowThreshold: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: AnalysisJobProps) {
    this._id = props.id || uuidv4();
    this._repositoryId = props.repositoryId;
    this._repositoryUrl = props.repositoryUrl;
    this._branch = props.branch;
    this._status = props.status || 'pending';
    this._progress = props.progress || 0;
    this._error = props.error || null;
    this._filesFound = props.filesFound || 0;
    this._filesBelowThreshold = props.filesBelowThreshold || 0;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  static create(props: Omit<AnalysisJobProps, 'id' | 'status' | 'progress' | 'error' | 'filesFound' | 'filesBelowThreshold' | 'createdAt' | 'updatedAt'>): AnalysisJob {
    return new AnalysisJob(props);
  }

  static reconstitute(props: AnalysisJobProps): AnalysisJob {
    return new AnalysisJob(props);
  }

  get id(): string {
    return this._id;
  }

  get repositoryId(): string {
    return this._repositoryId;
  }

  get repositoryUrl(): string {
    return this._repositoryUrl;
  }

  get branch(): string {
    return this._branch;
  }

  get status(): AnalysisJobStatus {
    return this._status;
  }

  get progress(): number {
    return this._progress;
  }

  get error(): string | null {
    return this._error;
  }

  get filesFound(): number {
    return this._filesFound;
  }

  get filesBelowThreshold(): number {
    return this._filesBelowThreshold;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  start(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot start job in ${this._status} status`);
    }
    this._status = 'running';
    this._progress = 0;
    this._updatedAt = new Date();
  }

  updateProgress(progress: number, message?: string): void {
    if (this._status !== 'running') {
      throw new Error('Cannot update progress for non-running job');
    }
    if (progress < 0 || progress > 100) {
      throw new Error(`Progress must be between 0 and 100, got ${progress}`);
    }
    this._progress = progress;
    this._updatedAt = new Date();
  }

  complete(filesFound: number, filesBelowThreshold: number): void {
    if (this._status !== 'running') {
      throw new Error(`Cannot complete job in ${this._status} status`);
    }
    this._status = 'completed';
    this._progress = 100;
    this._filesFound = filesFound;
    this._filesBelowThreshold = filesBelowThreshold;
    this._updatedAt = new Date();
  }

  fail(error: string): void {
    if (this._status !== 'running' && this._status !== 'pending') {
      throw new Error(`Cannot fail job in ${this._status} status`);
    }
    this._status = 'failed';
    this._error = error;
    this._updatedAt = new Date();
  }

  equals(other: AnalysisJob): boolean {
    return this._id === other._id;
  }
}
