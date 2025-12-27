import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ICoverageParser,
  FileCoverage,
  CoverageReport,
} from './ICoverageParser';

// Re-export types for backward compatibility
export { FileCoverage, CoverageReport };

/**
 * Parser for coverage reports (lcov and istanbul JSON formats)
 * Implements ICoverageParser port from domain
 */
export class CoverageParser implements ICoverageParser {
  private projectRoot: string = '';

  /**
   * Set the project root directory for path normalization
   */
  setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
  }

  /**
   * Parse coverage from a directory containing coverage output
   * Automatically detects format (lcov or istanbul JSON)
   */
  async parseCoverageDir(coverageDir: string): Promise<CoverageReport> {
    // Try istanbul JSON first (coverage-final.json)
    const istanbulPath = join(coverageDir, 'coverage-final.json');
    if (existsSync(istanbulPath)) {
      return this.parseIstanbulJson(istanbulPath);
    }

    // Try lcov.info
    const lcovPath = join(coverageDir, 'lcov.info');
    if (existsSync(lcovPath)) {
      return this.parseLcov(lcovPath);
    }

    throw new Error(`No coverage file found in ${coverageDir}`);
  }

  /**
   * Parse Istanbul JSON format (coverage-final.json)
   */
  parseIstanbulJson(filePath: string): CoverageReport {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as Record<string, IstanbulFileCoverage>;

    const files: FileCoverage[] = [];
    let totalCovered = 0;
    let totalLines = 0;

    for (const [path, coverage] of Object.entries(data)) {
      // Skip non-TypeScript files
      if (!path.endsWith('.ts') || path.endsWith('.spec.ts') || path.endsWith('.test.ts')) {
        continue;
      }

      const statementMap = coverage.statementMap;
      const statements = coverage.s;

      const linesTotal = Object.keys(statementMap).length;
      const linesCovered = Object.values(statements).filter((count) => count > 0).length;
      const percentage = linesTotal > 0 ? (linesCovered / linesTotal) * 100 : 100;

      // Find uncovered lines
      const uncoveredLines: number[] = [];
      for (const [key, location] of Object.entries(statementMap)) {
        if (statements[key] === 0) {
          uncoveredLines.push(location.start.line);
        }
      }

      files.push({
        path: this.normalizePath(path),
        linesCovered,
        linesTotal,
        percentage: Math.round(percentage * 100) / 100,
        uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
      });

      totalCovered += linesCovered;
      totalLines += linesTotal;
    }

    const totalCoverage = totalLines > 0 ? (totalCovered / totalLines) * 100 : 100;

    return {
      files: files.sort((a, b) => a.percentage - b.percentage),
      totalCoverage: Math.round(totalCoverage * 100) / 100,
    };
  }

  /**
   * Parse LCOV format (lcov.info)
   */
  parseLcov(filePath: string): CoverageReport {
    const content = readFileSync(filePath, 'utf-8');
    const files: FileCoverage[] = [];
    let totalCovered = 0;
    let totalLines = 0;

    let currentFile: string | null = null;
    let currentCovered = 0;
    let currentTotal = 0;
    const currentUncovered: number[] = [];

    for (const line of content.split('\n')) {
      if (line.startsWith('SF:')) {
        currentFile = line.substring(3);
        currentCovered = 0;
        currentTotal = 0;
        currentUncovered.length = 0;
      } else if (line.startsWith('DA:')) {
        const [lineNum, count] = line.substring(3).split(',').map(Number);
        currentTotal++;
        if (count > 0) {
          currentCovered++;
        } else {
          currentUncovered.push(lineNum);
        }
      } else if (line === 'end_of_record' && currentFile) {
        // Skip non-TypeScript files
        if (currentFile.endsWith('.ts') && !currentFile.endsWith('.spec.ts') && !currentFile.endsWith('.test.ts')) {
          const percentage = currentTotal > 0 ? (currentCovered / currentTotal) * 100 : 100;

          files.push({
            path: this.normalizePath(currentFile),
            linesCovered: currentCovered,
            linesTotal: currentTotal,
            percentage: Math.round(percentage * 100) / 100,
            uncoveredLines: [...currentUncovered].sort((a, b) => a - b),
          });

          totalCovered += currentCovered;
          totalLines += currentTotal;
        }
        currentFile = null;
      }
    }

    const totalCoverage = totalLines > 0 ? (totalCovered / totalLines) * 100 : 100;

    return {
      files: files.sort((a, b) => a.percentage - b.percentage),
      totalCoverage: Math.round(totalCoverage * 100) / 100,
    };
  }

  private normalizePath(filePath: string): string {
    // If we have a project root, make path relative to it
    if (this.projectRoot && filePath.startsWith(this.projectRoot)) {
      let relativePath = filePath.substring(this.projectRoot.length);
      // Remove leading slash
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      return relativePath;
    }

    // Fallback: find the LAST occurrence of common patterns
    // This handles cases like /Users/foo/src/project/src/file.ts
    const patterns = ['/src/', '/lib/', '/app/'];
    let lastIdx = -1;
    let lastPattern = '';

    for (const pattern of patterns) {
      const idx = filePath.lastIndexOf(pattern);
      if (idx > lastIdx) {
        lastIdx = idx;
        lastPattern = pattern;
      }
    }

    if (lastIdx !== -1) {
      return filePath.substring(lastIdx + 1); // Remove leading slash
    }

    return filePath;
  }
}

interface IstanbulFileCoverage {
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
}
