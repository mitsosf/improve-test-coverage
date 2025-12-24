/**
 * Port for parsing coverage reports
 * Infrastructure provides the adapter implementation
 */

export interface FileCoverage {
  path: string;
  linesCovered: number;
  linesTotal: number;
  percentage: number;
  uncoveredLines: number[];
}

export interface CoverageReport {
  files: FileCoverage[];
  totalCoverage: number;
}

export interface ICoverageParser {
  /**
   * Set the project root directory for path normalization
   */
  setProjectRoot(projectRoot: string): void;

  /**
   * Parse coverage from a directory containing coverage output
   * Automatically detects format (lcov or istanbul JSON)
   */
  parseCoverageDir(coverageDir: string): Promise<CoverageReport>;

  /**
   * Parse Istanbul JSON format (coverage-final.json)
   */
  parseIstanbulJson(filePath: string): CoverageReport;

  /**
   * Parse LCOV format (lcov.info)
   */
  parseLcov(filePath: string): CoverageReport;
}

export const COVERAGE_PARSER = Symbol('ICoverageParser');
