import chalk from 'chalk';
import ora from 'ora';
import { getServers, saveServer, type ServerEntry } from '../lib/config.js';
import { fetchRegistry, resolveLaunch } from '../lib/registry.js';

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
      const launch = resolveLaunch(latest);
      const next: ServerEntry = {
        ...entry,
        description: latest.description,
        package: launch.target,
        runtime: latest.runtime,
        command: launch.kind === 'stdio' ? launch.command : undefined,
        args: launch.kind === 'stdio' ? [...launch.args] : undefined,
        url: launch.kind === 'remote' ? launch.url : undefined,
      };
      const changed =
        next.description !== entry.description ||
        next.package !== entry.package ||
        next.runtime !== entry.runtime ||
        next.command !== entry.command ||
        next.url !== entry.url ||
        (next.args ?? []).join('\u0000') !== (entry.args ?? []).join('\u0000');
      if (!changed) {
        continue;
      }
      saveServer(next);
      updated.push(entry.name);
    }

    if (updated.length === 0) {
      spinner.succeed('All installed servers are up to date.');
    } else {
      spinner.succeed(`Updated ${updated.length} server definition(s): ${updated.join(', ')}`);
    }
    if (missing.length > 0) {
      console.log(chalk.yellow(`  not in the registry (custom install or removed): ${missing.join(', ')}`));
    }
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
