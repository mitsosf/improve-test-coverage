import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createRepository, analyzeRepository, setApiUrl, getApiUrl } from '../api.js';

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

      // Trigger analysis
      const report = await analyzeRepository(repo.id, options.branch);
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
