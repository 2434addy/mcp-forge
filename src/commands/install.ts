import chalk from 'chalk';
import ora from 'ora';
import { configureClients } from '../lib/clients.js';
import { getServer, saveServer } from '../lib/config.js';
import { fetchRegistry, findServer, resolveLaunch, type LaunchSpec, type Runtime } from '../lib/registry.js';

export interface InstallOptions {
  /** Install any npm package as an MCP server, bypassing the registry. */
  npm?: string;
  /** Install from a GitHub repo ("owner/repo") via npx github:, bypassing the registry. */
  github?: string;
}

/** Fully resolved definition ready to persist and register with clients. */
interface InstallTarget {
  name: string;
  description: string;
  runtime: Runtime;
  launch: LaunchSpec;
}

/** Normalize "owner/repo", "github:owner/repo" or a github.com URL to "owner/repo". */
function parseGithubRepo(input: string): string | undefined {
  const repo = input
    .replace(/^github:/, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : undefined;
}

export async function installCommand(serverName: string | undefined, options: InstallOptions = {}): Promise<void> {
  if (options.npm !== undefined && options.github !== undefined) {
    console.error(chalk.red('--npm and --github are mutually exclusive.'));
    process.exitCode = 1;
    return;
  }
  if (serverName === undefined && options.npm === undefined && options.github === undefined) {
    console.error(
      chalk.red(
        `Nothing to install. Pass a registry name (see ${chalk.cyan('mcp-forge list')}) or use --npm <package> / --github <owner/repo>.`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const spinner = ora('Resolving server...').start();
  try {
    let target: InstallTarget;
    if (options.npm !== undefined) {
      target = {
        name: serverName ?? options.npm,
        description: `Custom install from npm: ${options.npm}`,
        runtime: 'node',
        launch: { kind: 'stdio', target: options.npm, command: 'npx', args: ['-y', options.npm] },
      };
    } else if (options.github !== undefined) {
      const repo = parseGithubRepo(options.github);
      if (!repo) {
        spinner.fail(`--github expects "owner/repo" (or a github.com URL), got "${options.github}".`);
        process.exitCode = 1;
        return;
      }
      const match = /^[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)$/.exec(repo);
      const spec = `github:${repo}`;
      target = {
        name: serverName ?? (match ? match[1] : repo),
        description: `Custom install from GitHub: ${repo}`,
        runtime: 'node',
        launch: { kind: 'stdio', target: spec, command: 'npx', args: ['-y', spec] },
      };
    } else {
      const name = serverName ?? '';
      spinner.text = `Resolving "${name}" in the registry...`;
      if (getServer(name)) {
        spinner.warn(`"${name}" is already installed. Run ${chalk.cyan('mcp-forge update')} to refresh it.`);
        return;
      }
      const server = await findServer(name);
      if (!server) {
        spinner.fail(`"${name}" was not found in the registry.`);
        const available = await fetchRegistry();
        console.error(
          chalk.dim(
            `Run ${chalk.cyan('mcp-forge list')} to browse the ${available.length} available servers, or install a custom source with ${chalk.cyan('--npm <package>')} / ${chalk.cyan('--github <owner/repo>')}.`,
          ),
        );
        process.exitCode = 1;
        return;
      }
      target = {
        name: server.name,
        description: server.description,
        runtime: server.runtime,
        launch: resolveLaunch(server),
      };
    }

    if (getServer(target.name)) {
      spinner.warn(`"${target.name}" is already installed. Run ${chalk.cyan('mcp-forge update')} to refresh it.`);
      return;
    }

    const { launch } = target;
    const definition =
      launch.kind === 'stdio' ? { command: launch.command, args: [...launch.args] } : { url: launch.url };
    saveServer({
      name: target.name,
      description: target.description,
      package: launch.target,
      runtime: target.runtime,
      installedAt: new Date().toISOString(),
      ...definition,
    });
    spinner.succeed(`Installed ${chalk.green(target.name)} ${chalk.dim(`(${launch.target})`)}`);
    for (const result of configureClients(target.name, definition)) {
      if (result.status === 'configured') {
        console.log(`${chalk.green(`✓ Configured in ${result.client}`)} ${chalk.dim(`→ ${result.configPath}`)}`);
      } else if (result.status === 'skipped') {
        console.log(chalk.dim(`- ${result.client} ${result.reason} — skipped`));
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
