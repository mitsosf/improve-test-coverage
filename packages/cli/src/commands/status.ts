import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { listJobs, getJob, setApiUrl } from '../api.js';

export const statusCommand = new Command('status')
  .description('Check job status')
  .argument('[job-id]', 'Specific job ID to check')
  .option('--repo-id <id>', 'Filter jobs by repository ID')
  .action(async (jobId: string | undefined, options: { repoId?: string }) => {
    const parent = statusCommand.parent;
    if (parent?.opts().apiUrl) {
      setApiUrl(parent.opts().apiUrl);
    }

    const spinner = ora('Fetching job status...').start();

    try {
      if (jobId) {
        // Get specific job
        const job = await getJob(jobId);
        spinner.succeed('Job found');

        console.log();
        console.log(chalk.bold('Job Details'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`  ID:         ${job.id}`);
        console.log(`  Repository: ${job.repositoryName}`);
        console.log(`  File:       ${job.filePath}`);
        console.log(`  Provider:   ${job.aiProvider}`);
        console.log(`  Status:     ${getStatusColor(job.status)(job.status)}`);
        console.log(`  Progress:   ${getProgressBar(job.progress)}`);
        console.log(`  Created:    ${new Date(job.createdAt).toLocaleString()}`);
        console.log(`  Updated:    ${new Date(job.updatedAt).toLocaleString()}`);

        if (job.prUrl) {
          console.log();
          console.log(chalk.green.bold('Pull Request:'));
          console.log(`  ${chalk.underline(job.prUrl)}`);
        }

        if (job.error) {
          console.log();
          console.log(chalk.red.bold('Error:'));
          console.log(`  ${job.error}`);
        }
      } else {
        // List all jobs
        const { jobs, total } = await listJobs(options.repoId);
        spinner.succeed(`Found ${total} jobs`);

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs found. Use `cov improve` to start one.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.cyan('ID'),
            chalk.cyan('File'),
            chalk.cyan('Provider'),
            chalk.cyan('Status'),
            chalk.cyan('Progress'),
          ],
          colWidths: [40, 30, 10, 12, 15],
        });

        for (const job of jobs) {
          table.push([
            job.id,
            job.filePath.length > 28 ? '...' + job.filePath.slice(-25) : job.filePath,
            job.aiProvider,
            getStatusColor(job.status)(job.status),
            `${job.progress}%`,
          ]);
        }

        console.log(table.toString());
        console.log();
        console.log(chalk.gray('Use `cov status <job-id>` for detailed info'));
      }
    } catch (error) {
      spinner.fail('Failed to fetch job status');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'completed':
      return chalk.green;
    case 'running':
      return chalk.blue;
    case 'pending':
      return chalk.yellow;
    case 'failed':
      return chalk.red;
    case 'cancelled':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

function getProgressBar(progress: number): string {
  const width = 20;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `${bar} ${progress}%`;
}
