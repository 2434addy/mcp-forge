import chalk from 'chalk';
import { CONFIG_PATH, getServers } from '../lib/config.js';
import { isRunning } from '../lib/runner.js';

export function statusCommand(): void {
  const entries = Object.values(getServers());
  console.log(chalk.dim(`\nconfig: ${CONFIG_PATH}`));
  if (entries.length === 0) {
    console.log(chalk.dim(`No servers installed — try ${chalk.cyan('mcp-forge install filesystem')}\n`));
    return;
  }
  let running = 0;
  for (const entry of entries) {
    const alive = isRunning(entry.name);
    if (alive) {
      running += 1;
    }
    const state = alive ? chalk.green(`● running (pid ${entry.pid})`) : chalk.red('○ stopped');
    console.log(`  ${chalk.cyan(entry.name.padEnd(24))} ${state}`);
    const launchLine =
      entry.command !== undefined ? `${entry.command} ${(entry.args ?? []).join(' ')}` : `remote → ${entry.url ?? entry.package}`;
    console.log(chalk.dim(`      ${launchLine}`));
  }
  console.log(chalk.bold(`\n${running}/${entries.length} running\n`));
}
