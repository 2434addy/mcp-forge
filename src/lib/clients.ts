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

export type RemoveResult =
  | { client: string; status: 'removed'; configPath: string }
  | { client: string; status: 'skipped'; reason: string }
  | { client: string; status: 'failed'; reason: string };

interface ClientTarget {
  client: string;
  configPath: string;
  /** When set, the client is only configured if this path exists. */
  detectPath?: string;
  /** When set, written entries carry this "type" field (Claude Code's ~/.claude.json format). */
  entryType?: 'stdio';
}

/** Claude Desktop's config location differs per OS; Claude Code and Cursor live in the home dir everywhere. */
function clientTargets(): ClientTarget[] {
  let desktopConfig: string;
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    desktopConfig = path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'darwin') {
    desktopConfig = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    desktopConfig = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
  const cursorDir = path.join(os.homedir(), '.cursor');
  return [
    { client: 'Claude Code', configPath: path.join(os.homedir(), '.claude.json'), entryType: 'stdio' },
    { client: 'Claude Desktop', configPath: desktopConfig },
    { client: 'Cursor', configPath: path.join(cursorDir, 'mcp.json'), detectPath: cursorDir },
  ];
}

/**
 * Register the server in every detected MCP client (Claude Code, Claude Desktop, Cursor).
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

  const loaded = loadConfig(configPath);
  if (loaded.state === 'invalid') {
    return { client, status: 'failed', reason: loaded.reason };
  }
  const config = loaded.state === 'ok' ? loaded.config : {};

  const existing = config.mcpServers;
  const mcpServers =
    typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  mcpServers[serverName] =
    target.entryType === undefined ? definition : { type: target.entryType, ...definition };
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

type LoadedConfig =
  | { state: 'missing' }
  | { state: 'ok'; config: Record<string, unknown> }
  | { state: 'invalid'; reason: string };

/** Read and validate a client config file without ever throwing. */
function loadConfig(configPath: string): LoadedConfig {
  if (!fs.existsSync(configPath)) {
    return { state: 'missing' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (raw.trim().length === 0) {
      return { state: 'ok', config: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { state: 'invalid', reason: `${configPath} is not a JSON object — left untouched` };
    }
    return { state: 'ok', config: parsed as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: 'invalid', reason: `could not parse ${configPath} (${message}) — left untouched` };
  }
}

/**
 * Remove the server from every detected MCP client (Claude Code, Claude Desktop, Cursor).
 * Mirrors configureClients: never throws, each client reports
 * removed/skipped/failed independently, a corrupt config file is left
 * untouched rather than overwritten, and a missing file is never created.
 */
export function removeFromClients(serverName: string): RemoveResult[] {
  return clientTargets().map((target) => removeFromClient(target, serverName));
}

function removeFromClient(target: ClientTarget, serverName: string): RemoveResult {
  const { client, configPath } = target;
  if (target.detectPath !== undefined && !fs.existsSync(target.detectPath)) {
    return { client, status: 'skipped', reason: 'not detected' };
  }

  const loaded = loadConfig(configPath);
  if (loaded.state === 'missing') {
    return { client, status: 'skipped', reason: 'no config file' };
  }
  if (loaded.state === 'invalid') {
    return { client, status: 'failed', reason: loaded.reason };
  }

  const { config } = loaded;
  const existing = config.mcpServers;
  if (
    typeof existing !== 'object' ||
    existing === null ||
    Array.isArray(existing) ||
    !(serverName in existing)
  ) {
    return { client, status: 'skipped', reason: 'not configured' };
  }
  const mcpServers = existing as Record<string, unknown>;
  delete mcpServers[serverName];

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { client, status: 'failed', reason: `could not write ${configPath} (${message})` };
  }
  return { client, status: 'removed', configPath };
}
