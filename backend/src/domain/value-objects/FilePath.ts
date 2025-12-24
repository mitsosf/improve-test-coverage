/**
 * Value Object representing a TypeScript file path
 * Validates that the path ends with .ts
 */
export class FilePath {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(value: string): FilePath {
    if (!value || value.trim() === '') {
      throw new Error('File path cannot be empty');
    }

    const normalized = value.trim().replace(/\\/g, '/');

    if (!normalized.endsWith('.ts')) {
      throw new Error(`File path must be a TypeScript file (.ts), got: ${normalized}`);
    }

    // Don't allow test files as targets
    if (normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) {
      throw new Error('Cannot improve coverage for test files');
    }

    return new FilePath(normalized);
  }

  get value(): string {
    return this._value;
  }

  get fileName(): string {
    const parts = this._value.split('/');
    return parts[parts.length - 1];
  }

  get directory(): string {
    const parts = this._value.split('/');
    parts.pop();
    return parts.join('/');
  }

  get testFilePath(): string {
    return this._value.replace('.ts', '.test.ts');
  }

  equals(other: FilePath): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
