#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { listCommand } from './commands/list.js';
import { improveCommand } from './commands/improve.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('cov')
  .description('CLI for Coverage Improver - analyze and improve TypeScript test coverage')
  .version('1.0.0')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000/api');

program.addCommand(analyzeCommand);
program.addCommand(listCommand);
program.addCommand(improveCommand);
program.addCommand(statusCommand);

program.parse();
