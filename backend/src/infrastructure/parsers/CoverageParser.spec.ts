import { CoverageParser } from './CoverageParser';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('CoverageParser', () => {
  const parser = new CoverageParser();
  const testDir = join(__dirname, '__test_fixtures__');

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('parseIstanbulJson', () => {
    it('should parse istanbul coverage-final.json', () => {
      const istanbulData = {
        '/project/src/utils.ts': {
          statementMap: {
            '0': { start: { line: 1 }, end: { line: 1 } },
            '1': { start: { line: 2 }, end: { line: 2 } },
            '2': { start: { line: 3 }, end: { line: 3 } },
            '3': { start: { line: 4 }, end: { line: 4 } },
          },
          s: { '0': 1, '1': 1, '2': 0, '3': 0 },
        },
      };

      const filePath = join(testDir, 'coverage-final.json');
      writeFileSync(filePath, JSON.stringify(istanbulData));

      const report = parser.parseIstanbulJson(filePath);

      expect(report.files).toHaveLength(1);
      expect(report.files[0].path).toBe('src/utils.ts');
      expect(report.files[0].percentage).toBe(50);
      expect(report.files[0].uncoveredLines).toContain(3);
      expect(report.files[0].uncoveredLines).toContain(4);
    });

    it('should skip test files', () => {
      const istanbulData = {
        '/project/src/utils.ts': {
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 1 },
        },
        '/project/src/utils.spec.ts': {
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 1 },
        },
      };

      const filePath = join(testDir, 'coverage-final2.json');
      writeFileSync(filePath, JSON.stringify(istanbulData));

      const report = parser.parseIstanbulJson(filePath);

      expect(report.files).toHaveLength(1);
      expect(report.files[0].path).toBe('src/utils.ts');
    });
  });

  describe('parseLcov', () => {
    it('should parse lcov.info format', () => {
      const lcovContent = `SF:/project/src/utils.ts
DA:1,1
DA:2,1
DA:3,0
DA:4,0
end_of_record
`;

      const filePath = join(testDir, 'lcov.info');
      writeFileSync(filePath, lcovContent);

      const report = parser.parseLcov(filePath);

      expect(report.files).toHaveLength(1);
      expect(report.files[0].percentage).toBe(50);
      expect(report.files[0].uncoveredLines).toEqual([3, 4]);
    });

    it('should handle multiple files', () => {
      const lcovContent = `SF:/project/src/a.ts
DA:1,1
end_of_record
SF:/project/src/b.ts
DA:1,0
end_of_record
`;

      const filePath = join(testDir, 'lcov2.info');
      writeFileSync(filePath, lcovContent);

      const report = parser.parseLcov(filePath);

      expect(report.files).toHaveLength(2);
      // Files are sorted by coverage percentage (lowest first)
      expect(report.files[0].percentage).toBe(0);
      expect(report.files[1].percentage).toBe(100);
    });
  });
});
