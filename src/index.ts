#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import { installCommand } from './commands/install.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { statusCommand } from './commands/status.js';
import { uiCommand } from './commands/ui.js';
import { updateCommand } from './commands/update.js';

const program = new Command();

program
  .name('mcp-forge')
  .description('Install, run and manage MCP servers — Windows, macOS and Linux')
  .version('0.1.0');

program
  .command('install')
  .argument('[server-name]', 'registry name (or npm package) of the MCP server')
  .option('--npm <package>', 'install any npm package as an MCP server (bypasses the registry)')
  .option('--github <owner/repo>', 'install an MCP server from a GitHub repo (bypasses the registry)')
  .description('Install an MCP server from the registry or a custom source')
  .action(installCommand);

program
  .command('remove')
  .argument('<server-name>', 'name of an installed MCP server')
  .description('Stop and remove an installed MCP server')
  .action(removeCommand);

program
  .command('list')
  .description('List installed servers and everything available in the registry')
  .action(listCommand);

program
  .command('update')
  .description('Refresh installed server definitions from the registry')
  .action(updateCommand);

program
  .command('status')
  .description('Show which installed servers are running')
  .action(statusCommand);

program
  .command('ui')
  .description('Launch the interactive TUI dashboard')
  .action(uiCommand);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
