import chalk from 'chalk';
import { getServers } from '../lib/config.js';
import { fetchRegistry } from '../lib/registry.js';
import { isRunning } from '../lib/runner.js';

export async function listCommand(): Promise<void> {
  const installed = getServers();
  const registry = await fetchRegistry();
  const installedNames = new Set(Object.keys(installed));

  console.log(chalk.bold('\nInstalled'));
  const entries = Object.values(installed);
  if (entries.length === 0) {
    console.log(chalk.dim(`  (none) — try ${chalk.cyan('mcp-forge install filesystem')}`));
  }
  for (const entry of entries) {
    const state = isRunning(entry.name) ? chalk.green('● running') : chalk.dim('○ stopped');
    console.log(`  ${chalk.cyan(entry.name.padEnd(24))} ${state}  ${chalk.dim(entry.package)}`);
  }

  console.log(chalk.bold('\nAvailable in registry'));
  for (const server of registry) {
    const marker = installedNames.has(server.name) ? chalk.green('✓') : ' ';
    console.log(`  ${marker} ${chalk.cyan(server.name.padEnd(22))} ${chalk.dim(server.description)}`);
  }
  console.log();
}
