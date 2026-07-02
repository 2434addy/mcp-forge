import chalk from 'chalk';
import ora from 'ora';
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
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
