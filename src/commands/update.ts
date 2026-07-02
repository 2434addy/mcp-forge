import chalk from 'chalk';
import ora from 'ora';
import { getServers, saveServer } from '../lib/config.js';
import { fetchRegistry } from '../lib/registry.js';

export async function updateCommand(): Promise<void> {
  const spinner = ora('Refreshing server definitions from the registry...').start();
  try {
    const installed = Object.values(getServers());
    if (installed.length === 0) {
      spinner.info(`No servers installed — nothing to update. See ${chalk.cyan('mcp-forge list')}.`);
      return;
    }
    const registry = await fetchRegistry();
    const byName = new Map(registry.map((server) => [server.name, server] as const));

    const updated: string[] = [];
    const missing: string[] = [];
    for (const entry of installed) {
      const latest = byName.get(entry.name);
      if (!latest) {
        missing.push(entry.name);
        continue;
      }
      const changed =
        latest.package !== entry.package ||
        latest.command !== entry.command ||
        latest.description !== entry.description ||
        latest.args.join('\u0000') !== entry.args.join('\u0000') ||
        (latest.version !== undefined && latest.version !== entry.version);
      if (!changed) {
        continue;
      }
      saveServer({
        ...entry,
        description: latest.description,
        package: latest.package,
        command: latest.command,
        args: [...latest.args],
        version: latest.version,
      });
      updated.push(entry.name);
    }

    if (updated.length === 0) {
      spinner.succeed('All installed servers are up to date.');
    } else {
      spinner.succeed(`Updated ${updated.length} server definition(s): ${updated.join(', ')}`);
    }
    if (missing.length > 0) {
      console.log(chalk.yellow(`  no longer in registry: ${missing.join(', ')}`));
    }
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
