import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Shape of one entry under "mcpServers" in a client config file. */
export interface McpServerDefinition {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export type ConfigureResult =
  | { client: string; status: 'configured'; configPath: string }
  | { client: string; status: 'skipped'; reason: string }
  | { client: string; status: 'failed'; reason: string };

interface ClientTarget {
  client: string;
  configPath: string;
  /** When set, the client is only configured if this path exists. */
  detectPath?: string;
}

/** Claude's config location differs per OS; Cursor uses ~/.cursor everywhere. */
function clientTargets(): ClientTarget[] {
  let claudeConfig: string;
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    claudeConfig = path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'darwin') {
    claudeConfig = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    claudeConfig = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
  const cursorDir = path.join(os.homedir(), '.cursor');
  return [
    { client: 'Claude Code', configPath: claudeConfig },
    { client: 'Cursor', configPath: path.join(cursorDir, 'mcp.json'), detectPath: cursorDir },
  ];
}

/**
 * Register the server in every detected MCP client (Claude Code, Cursor).
 * Never throws: each client reports configured/skipped/failed independently,
 * and a corrupt config file is left untouched rather than overwritten.
 */
export function configureClients(serverName: string, definition: McpServerDefinition): ConfigureResult[] {
  return clientTargets().map((target) => configureClient(target, serverName, definition));
}

function configureClient(
  target: ClientTarget,
  serverName: string,
  definition: McpServerDefinition,
): ConfigureResult {
  const { client, configPath } = target;
  if (target.detectPath !== undefined && !fs.existsSync(target.detectPath)) {
    return { client, status: 'skipped', reason: 'not detected' };
  }

  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      if (raw.trim().length > 0) {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return { client, status: 'failed', reason: `${configPath} is not a JSON object — left untouched` };
        }
        config = parsed as Record<string, unknown>;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { client, status: 'failed', reason: `could not parse ${configPath} (${message}) — left untouched` };
    }
  }

  const existing = config.mcpServers;
  const mcpServers =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  mcpServers[serverName] = definition;
  config.mcpServers = mcpServers;

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { client, status: 'failed', reason: `could not write ${configPath} (${message})` };
  }
  return { client, status: 'configured', configPath };
}
