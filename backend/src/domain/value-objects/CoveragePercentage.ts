/**
 * Value Object representing a coverage percentage (0-100)
 * Immutable and self-validating
 */
export class CoveragePercentage {
  private readonly _value: number;

  private constructor(value: number) {
    this._value = value;
  }

  static create(value: number): CoveragePercentage {
    if (value < 0 || value > 100) {
      throw new Error(`Coverage percentage must be between 0 and 100, got ${value}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error('Coverage percentage must be a finite number');
    }
    return new CoveragePercentage(Math.round(value * 100) / 100); // Round to 2 decimals
  }

  get value(): number {
    return this._value;
  }

  isBelow(threshold: number): boolean {
    return this._value < threshold;
  }

  isAbove(threshold: number): boolean {
    return this._value > threshold;
  }

  equals(other: CoveragePercentage): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return `${this._value}%`;
  }
}
