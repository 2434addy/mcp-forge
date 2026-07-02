import chalk from 'chalk';
import { getServers } from '../lib/config.js';
import { fetchRegistry, type RegistryServer } from '../lib/registry.js';
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

  const byCategory = new Map<string, RegistryServer[]>();
  for (const server of registry) {
    const bucket = byCategory.get(server.category);
    if (bucket) {
      bucket.push(server);
    } else {
      byCategory.set(server.category, [server]);
    }
  }

  console.log(
    chalk.bold('\nAvailable in registry') +
      chalk.dim(` — ${registry.length} servers in ${byCategory.size} categories`),
  );
  for (const category of [...byCategory.keys()].sort()) {
    console.log(chalk.magenta(`\n  ${category}`));
    for (const server of byCategory.get(category) ?? []) {
      const marker = installedNames.has(server.name) ? chalk.green('✓') : ' ';
      console.log(`  ${marker} ${chalk.cyan(server.name.padEnd(28))} ${chalk.dim(server.description)}`);
    }
  }
  console.log();
}
