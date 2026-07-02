import chalk from 'chalk';
import ora from 'ora';
import { configureClients } from '../lib/clients.js';
import { getServer, saveServer } from '../lib/config.js';
import { fetchRegistry, findServer } from '../lib/registry.js';

export async function installCommand(serverName: string): Promise<void> {
  const spinner = ora(`Resolving "${serverName}" in the registry...`).start();
  try {
    if (getServer(serverName)) {
      spinner.warn(`"${serverName}" is already installed. Run ${chalk.cyan('mcp-forge update')} to refresh it.`);
      return;
    }
    const server = await findServer(serverName);
    if (!server) {
      spinner.fail(`"${serverName}" was not found in the registry.`);
      const available = await fetchRegistry();
      console.error(chalk.dim(`Available: ${available.map((entry) => entry.name).join(', ')}`));
      process.exitCode = 1;
      return;
    }
    saveServer({
      name: server.name,
      description: server.description,
      package: server.package,
      command: server.command,
      args: [...server.args],
      version: server.version,
      installedAt: new Date().toISOString(),
    });
    spinner.succeed(`Installed ${chalk.green(server.name)} ${chalk.dim(`(${server.package})`)}`);
    for (const result of configureClients(server.name, { command: server.command, args: [...server.args] })) {
      if (result.status === 'configured') {
        console.log(`${chalk.green(`✓ Configured in ${result.client}`)} ${chalk.dim(`→ ${result.configPath}`)}`);
      } else if (result.status === 'skipped') {
        console.log(chalk.dim(`- ${result.client} not detected — skipped`));
      } else {
        console.log(chalk.yellow(`! ${result.client}: ${result.reason}`));
      }
    }
    console.log(
      chalk.dim(`  manage it with ${chalk.cyan('mcp-forge ui')} or check ${chalk.cyan('mcp-forge status')}`),
    );
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
