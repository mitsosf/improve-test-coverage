/**
 * Value Object representing a GitHub Pull Request URL
 */
export class GitHubPrUrl {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(value: string): GitHubPrUrl {
    if (!value || value.trim() === '') {
      throw new Error('GitHub PR URL cannot be empty');
    }

    const url = value.trim();
    const prUrlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

    if (!prUrlPattern.test(url)) {
      throw new Error(`Invalid GitHub PR URL format: ${url}`);
    }

    return new GitHubPrUrl(url);
  }

  get value(): string {
    return this._value;
  }

  get prNumber(): number {
    const match = this._value.match(/\/pull\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  get repositoryPath(): string {
    const match = this._value.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull/);
    return match ? match[1] : '';
  }

  equals(other: GitHubPrUrl): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
