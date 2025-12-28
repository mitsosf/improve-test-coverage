import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createRepository, analyzeRepository, getAnalysisJob, getCoverage, setApiUrl, getApiUrl } from '../api.js';

export const analyzeCommand = new Command('analyze')
  .description('Analyze test coverage for a GitHub repository')
  .argument('<repo-url>', 'GitHub repository URL')
  .option('-b, --branch <branch>', 'Branch to analyze', 'main')
  .action(async (repoUrl: string, options: { branch: string }) => {
    const parent = analyzeCommand.parent;
    if (parent?.opts().apiUrl) {
      setApiUrl(parent.opts().apiUrl);
    }

    const spinner = ora('Registering repository...').start();

    try {
      // Register or get existing repository
      const repo = await createRepository(repoUrl, options.branch);
      spinner.text = `Analyzing coverage for ${repo.name}...`;

      // Trigger analysis job
      let currentJob = await analyzeRepository(repo.id, options.branch);

      // Poll for job completion
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const pollInterval = 2000; // 2 seconds
      const startTime = Date.now();

      while (currentJob.status !== 'completed' && currentJob.status !== 'failed') {
        if (Date.now() - startTime > maxWaitTime) {
          throw new Error('Analysis timed out');
        }

        spinner.text = `Analyzing coverage for ${repo.name}... ${currentJob.progress}%`;
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const updatedJob = await getAnalysisJob(repo.id);
        if (!updatedJob) {
          throw new Error('Analysis job not found');
        }
        currentJob = updatedJob;
      }

      if (currentJob.status === 'failed') {
        throw new Error(currentJob.error || 'Analysis failed');
      }

      // Fetch coverage data
      const report = await getCoverage(repo.id);
      spinner.succeed(`Analysis complete for ${repo.name}`);

      // Display results
      console.log();
      console.log(chalk.bold('Coverage Report'));
      console.log(chalk.gray('─'.repeat(50)));

      const table = new Table({
        head: [
          chalk.cyan('File'),
          chalk.cyan('Coverage'),
          chalk.cyan('Status'),
          chalk.cyan('Uncovered Lines'),
        ],
        colWidths: [40, 12, 12, 20],
      });

      for (const file of report.files) {
        const coverage = file.coveragePercentage;
        const coverageColor = coverage >= 80 ? chalk.green : coverage >= 50 ? chalk.yellow : chalk.red;
        const statusColor = file.status === 'improved' ? chalk.green :
                           file.status === 'improving' ? chalk.yellow : chalk.gray;

        table.push([
          file.path.length > 38 ? '...' + file.path.slice(-35) : file.path,
          coverageColor(`${coverage.toFixed(1)}%`),
          statusColor(file.status),
          file.uncoveredLines.slice(0, 5).join(', ') + (file.uncoveredLines.length > 5 ? '...' : ''),
        ]);
      }

      console.log(table.toString());
      console.log();
      console.log(chalk.bold('Summary'));
      console.log(`  Total files: ${report.summary.totalFiles}`);
      console.log(`  Average coverage: ${report.summary.averageCoverage.toFixed(1)}%`);
      console.log(`  Files below 80%: ${chalk.red(report.summary.filesBelowThreshold.toString())}`);
      console.log();
      console.log(chalk.gray(`Repository ID: ${repo.id}`));
      console.log(chalk.gray(`API: ${getApiUrl()}`));
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });
