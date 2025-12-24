import { Command } from 'commander';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { createJob, getJob, setApiUrl } from '../api.js';
import type { AiProvider } from '@coverage-improver/shared';

export const improveCommand = new Command('improve')
  .description('Start a test improvement job for a file')
  .requiredOption('--repo-id <id>', 'Repository ID')
  .requiredOption('--file-id <id>', 'File ID to improve')
  .option('-p, --provider <provider>', 'AI provider (claude or openai)', 'claude')
  .option('-w, --wait', 'Wait for job completion', false)
  .action(async (options: { repoId: string; fileId: string; provider: string; wait: boolean }) => {
    const parent = improveCommand.parent;
    if (parent?.opts().apiUrl) {
      setApiUrl(parent.opts().apiUrl);
    }

    const provider = options.provider as AiProvider;
    if (provider !== 'claude' && provider !== 'openai') {
      console.error(chalk.red('Provider must be "claude" or "openai"'));
      process.exit(1);
    }

    const spinner = ora(`Creating improvement job with ${provider}...`).start();

    try {
      const job = await createJob(options.repoId, options.fileId, provider);
      spinner.succeed(`Job created: ${job.id}`);

      console.log();
      console.log(chalk.bold('Job Details'));
      console.log(`  ID: ${job.id}`);
      console.log(`  File: ${job.filePath}`);
      console.log(`  Provider: ${job.aiProvider}`);
      console.log(`  Status: ${chalk.yellow(job.status)}`);

      if (options.wait) {
        console.log();
        await waitForJob(job.id, spinner);
      } else {
        console.log();
        console.log(chalk.gray(`Use 'cov status ${job.id}' to check progress`));
        console.log(chalk.gray(`Or use 'cov improve ... --wait' to wait for completion`));
      }
    } catch (error) {
      spinner.fail('Failed to create job');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });

async function waitForJob(jobId: string, spinner: Ora): Promise<void> {
  spinner.start('Waiting for job completion...');

  let lastProgress = 0;

  while (true) {
    const job = await getJob(jobId);

    if (job.progress !== lastProgress) {
      spinner.text = `Progress: ${job.progress}% - ${getProgressMessage(job.progress)}`;
      lastProgress = job.progress;
    }

    if (job.status === 'completed') {
      spinner.succeed('Job completed successfully!');
      console.log();
      console.log(chalk.green.bold('Pull Request Created:'));
      console.log(`  ${chalk.underline(job.prUrl)}`);
      return;
    }

    if (job.status === 'failed') {
      spinner.fail('Job failed');
      console.error(chalk.red(`Error: ${job.error}`));
      process.exit(1);
    }

    if (job.status === 'cancelled') {
      spinner.warn('Job was cancelled');
      return;
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function getProgressMessage(progress: number): string {
  if (progress < 10) return 'Starting...';
  if (progress < 20) return 'Cloning repository...';
  if (progress < 30) return 'Creating branch...';
  if (progress < 40) return 'Reading source file...';
  if (progress < 60) return 'Generating tests with AI...';
  if (progress < 70) return 'Writing test file...';
  if (progress < 85) return 'Committing changes...';
  if (progress < 95) return 'Creating pull request...';
  return 'Finalizing...';
}
