import { CoveragePercentage } from './CoveragePercentage';

describe('CoveragePercentage', () => {
  describe('create', () => {
    it('should create with valid percentage', () => {
      const coverage = CoveragePercentage.create(75.5);
      expect(coverage.value).toBe(75.5);
    });

    it('should round to 2 decimal places', () => {
      const coverage = CoveragePercentage.create(75.555);
      expect(coverage.value).toBe(75.56);
    });

    it('should accept 0', () => {
      const coverage = CoveragePercentage.create(0);
      expect(coverage.value).toBe(0);
    });

    it('should accept 100', () => {
      const coverage = CoveragePercentage.create(100);
      expect(coverage.value).toBe(100);
    });

    it('should throw for negative value', () => {
      expect(() => CoveragePercentage.create(-1)).toThrow('must be between 0 and 100');
    });

    it('should throw for value over 100', () => {
      expect(() => CoveragePercentage.create(101)).toThrow('must be between 0 and 100');
    });
  });

  describe('isBelow', () => {
    it('should return true when below threshold', () => {
      const coverage = CoveragePercentage.create(75);
      expect(coverage.isBelow(80)).toBe(true);
    });

    it('should return false when at threshold', () => {
      const coverage = CoveragePercentage.create(80);
      expect(coverage.isBelow(80)).toBe(false);
    });

    it('should return false when above threshold', () => {
      const coverage = CoveragePercentage.create(85);
      expect(coverage.isBelow(80)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should format as percentage', () => {
      const coverage = CoveragePercentage.create(75.5);
      expect(coverage.toString()).toBe('75.5%');
    });
  });
});
