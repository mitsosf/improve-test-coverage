/**
 * Value Object representing the status of an improvement job
 * Implements a simple state machine
 */
export type JobStatusValue = 'pending' | 'running' | 'completed' | 'failed';

export class JobStatus {
  private readonly _value: JobStatusValue;

  private constructor(value: JobStatusValue) {
    this._value = value;
  }

  static pending(): JobStatus {
    return new JobStatus('pending');
  }

  static running(): JobStatus {
    return new JobStatus('running');
  }

  static completed(): JobStatus {
    return new JobStatus('completed');
  }

  static failed(): JobStatus {
    return new JobStatus('failed');
  }

  static fromString(value: string): JobStatus {
    const validStatuses: JobStatusValue[] = ['pending', 'running', 'completed', 'failed'];
    if (!validStatuses.includes(value as JobStatusValue)) {
      throw new Error(`Invalid job status: ${value}`);
    }
    return new JobStatus(value as JobStatusValue);
  }

  get value(): JobStatusValue {
    return this._value;
  }

  get isPending(): boolean {
    return this._value === 'pending';
  }

  get isRunning(): boolean {
    return this._value === 'running';
  }

  get isCompleted(): boolean {
    return this._value === 'completed';
  }

  get isFailed(): boolean {
    return this._value === 'failed';
  }

  get isTerminal(): boolean {
    return this._value === 'completed' || this._value === 'failed';
  }

  canTransitionTo(newStatus: JobStatus): boolean {
    // Valid transitions:
    // pending -> running
    // running -> completed | failed
    const transitions: Record<JobStatusValue, JobStatusValue[]> = {
      pending: ['running'],
      running: ['completed', 'failed'],
      completed: [],
      failed: [],
    };

    return transitions[this._value].includes(newStatus._value);
  }

  equals(other: JobStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
