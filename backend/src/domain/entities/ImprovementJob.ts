import { v4 as uuidv4 } from 'uuid';
import { JobStatus } from '../value-objects/JobStatus';
import { GitHubPrUrl } from '../value-objects/GitHubPrUrl';

export type AiProvider = 'claude' | 'openai';

export interface ImprovementJobProps {
  id?: string;
  repositoryId: string;
  fileId: string;
  filePath: string;
  status?: JobStatus;
  aiProvider: AiProvider;
  progress?: number;
  prUrl?: GitHubPrUrl | null;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Entity representing a job to improve test coverage for a file
 * Implements state machine for job lifecycle
 */
export class ImprovementJob {
  private readonly _id: string;
  private readonly _repositoryId: string;
  private readonly _fileId: string;
  private readonly _filePath: string;
  private _status: JobStatus;
  private readonly _aiProvider: AiProvider;
  private _progress: number;
  private _prUrl: GitHubPrUrl | null;
  private _error: string | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ImprovementJobProps) {
    this._id = props.id || uuidv4();
    this._repositoryId = props.repositoryId;
    this._fileId = props.fileId;
    this._filePath = props.filePath;
    this._status = props.status || JobStatus.pending();
    this._aiProvider = props.aiProvider;
    this._progress = props.progress || 0;
    this._prUrl = props.prUrl || null;
    this._error = props.error || null;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  static create(props: Omit<ImprovementJobProps, 'id' | 'status' | 'progress' | 'prUrl' | 'error' | 'createdAt' | 'updatedAt'>): ImprovementJob {
    return new ImprovementJob(props);
  }

  static reconstitute(props: ImprovementJobProps): ImprovementJob {
    return new ImprovementJob(props);
  }

  get id(): string {
    return this._id;
  }

  get repositoryId(): string {
    return this._repositoryId;
  }

  get fileId(): string {
    return this._fileId;
  }

  get filePath(): string {
    return this._filePath;
  }

  get status(): JobStatus {
    return this._status;
  }

  get aiProvider(): AiProvider {
    return this._aiProvider;
  }

  get progress(): number {
    return this._progress;
  }

  get prUrl(): GitHubPrUrl | null {
    return this._prUrl;
  }

  get error(): string | null {
    return this._error;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  start(): void {
    this.transitionTo(JobStatus.running());
    this._progress = 0;
  }

  updateProgress(progress: number): void {
    if (!this._status.isRunning) {
      throw new Error('Cannot update progress for non-running job');
    }
    if (progress < 0 || progress > 100) {
      throw new Error(`Progress must be between 0 and 100, got ${progress}`);
    }
    this._progress = progress;
    this._updatedAt = new Date();
  }

  complete(prUrl: GitHubPrUrl): void {
    this.transitionTo(JobStatus.completed());
    this._prUrl = prUrl;
    this._progress = 100;
  }

  fail(error: string): void {
    this.transitionTo(JobStatus.failed());
    this._error = error;
  }

  private transitionTo(newStatus: JobStatus): void {
    if (!this._status.canTransitionTo(newStatus)) {
      throw new Error(`Invalid status transition from ${this._status.value} to ${newStatus.value}`);
    }
    this._status = newStatus;
    this._updatedAt = new Date();
  }

  equals(other: ImprovementJob): boolean {
    return this._id === other._id;
  }
}
