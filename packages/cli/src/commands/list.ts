import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { listRepositories, getCoverage, setApiUrl } from '../api.js';

export const listCommand = new Command('list')
  .description('List repositories or files below coverage threshold')
  .option('-r, --repos', 'List all registered repositories')
  .option('--repo-id <id>', 'List files for a specific repository')
  .option('-t, --threshold <percent>', 'Coverage threshold (default: 80)', '80')
  .action(async (options: { repos?: boolean; repoId?: string; threshold: string }) => {
    const parent = listCommand.parent;
    if (parent?.opts().apiUrl) {
      setApiUrl(parent.opts().apiUrl);
    }

    const spinner = ora('Fetching data...').start();

    try {
      if (options.repos) {
        // List all repositories
        const repos = await listRepositories();
        spinner.succeed(`Found ${repos.length} repositories`);

        if (repos.length === 0) {
          console.log(chalk.yellow('No repositories registered. Use `cov analyze <url>` to add one.'));
          return;
        }

        const table = new Table({
          head: [chalk.cyan('ID'), chalk.cyan('Name'), chalk.cyan('Branch'), chalk.cyan('Last Analyzed')],
          colWidths: [40, 30, 15, 25],
        });

        for (const repo of repos) {
          table.push([
            repo.id,
            repo.name,
            repo.defaultBranch,
            repo.lastAnalyzedAt ? new Date(repo.lastAnalyzedAt).toLocaleString() : chalk.gray('Never'),
          ]);
        }

        console.log(table.toString());
      } else if (options.repoId) {
        // List files for a specific repository
        const threshold = parseInt(options.threshold, 10);
        const report = await getCoverage(options.repoId);

        const belowThreshold = report.files.filter(f => f.coveragePercentage < threshold);
        spinner.succeed(`Found ${belowThreshold.length} files below ${threshold}% coverage`);

        if (belowThreshold.length === 0) {
          console.log(chalk.green(`All files are above ${threshold}% coverage!`));
          return;
        }

        const table = new Table({
          head: [
            chalk.cyan('File ID'),
            chalk.cyan('Path'),
            chalk.cyan('Coverage'),
            chalk.cyan('Status'),
          ],
          colWidths: [40, 35, 12, 12],
        });

        for (const file of belowThreshold.sort((a, b) => a.coveragePercentage - b.coveragePercentage)) {
          const coverageColor = file.coveragePercentage < 50 ? chalk.red : chalk.yellow;
          table.push([
            file.id,
            file.path.length > 33 ? '...' + file.path.slice(-30) : file.path,
            coverageColor(`${file.coveragePercentage.toFixed(1)}%`),
            file.status,
          ]);
        }

        console.log(table.toString());
        console.log();
        console.log(chalk.gray(`Use 'cov improve --file-id <id> --repo-id ${options.repoId}' to improve coverage`));
      } else {
        spinner.fail('Please specify --repos or --repo-id');
        console.log(chalk.yellow('Examples:'));
        console.log('  cov list --repos                    # List all repositories');
        console.log('  cov list --repo-id <id>             # List files below threshold');
        console.log('  cov list --repo-id <id> -t 70       # Files below 70%');
      }
    } catch (error) {
      spinner.fail('Failed to fetch data');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });
