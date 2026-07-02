import chalk from 'chalk';
import ora from 'ora';
import { removeFromClients } from '../lib/clients.js';
import { getServer, removeServer } from '../lib/config.js';
import { isRunning, stopServer } from '../lib/runner.js';

export async function removeCommand(serverName: string): Promise<void> {
  const spinner = ora(`Removing "${serverName}"...`).start();
  try {
    if (!getServer(serverName)) {
      spinner.fail(`"${serverName}" is not installed. See ${chalk.cyan('mcp-forge list')}.`);
      process.exitCode = 1;
      return;
    }
    if (isRunning(serverName)) {
      spinner.text = `Stopping "${serverName}"...`;
      stopServer(serverName);
    }
    removeServer(serverName);
    spinner.succeed(`Removed ${chalk.green(serverName)}`);
    for (const result of removeFromClients(serverName)) {
      if (result.status === 'removed') {
        console.log(`${chalk.green(`✓ Removed from ${result.client}`)} ${chalk.dim(`→ ${result.configPath}`)}`);
      } else if (result.status === 'skipped') {
        console.log(chalk.dim(`- ${result.client} ${result.reason} — skipped`));
      } else {
        console.log(chalk.yellow(`! ${result.client}: ${result.reason}`));
      }
    }
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
