export interface SandboxAnalysisResult {
  success: boolean;
  coverageJson?: Record<string, unknown>;
  sourceFiles?: Array<{ path: string; content: string }>;
  logs: string[];
  error?: string;
}

export interface SandboxTestResult {
  success: boolean;
  testsPassed: boolean;
  coverageJson?: Record<string, unknown>;
  logs: string[];
  error?: string;
}

export interface ISandbox {
  /**
   * Clone repo, install deps, run tests, return coverage data and source files
   */
  runAnalysis(options: {
    repoUrl: string;
    branch: string;
    onProgress?: (message: string) => void;
  }): Promise<SandboxAnalysisResult>;

  /**
   * Clone repo, install deps, write test files, run tests, return results
   */
  runTests(options: {
    repoUrl: string;
    branch: string;
    testFiles: Array<{ path: string; content: string }>;
    onProgress?: (message: string) => void;
  }): Promise<SandboxTestResult>;
}

export const SANDBOX = Symbol('SANDBOX');
