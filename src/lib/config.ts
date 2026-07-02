import os from 'node:os';
import path from 'node:path';
import Configstore from 'configstore';

export interface ServerEntry {
  name: string;
  description: string;
  /** What npx runs: an npm package name or a "github:owner/repo" specifier. */
  package: string;
  /** Executable used to launch the server, e.g. "npx". */
  command: string;
  args: string[];
  env?: Record<string, string>;
  version?: string;
  installedAt: string;
  /** PID of the running process, when started via mcp-forge. */
  pid?: number;
}

/**
 * Config lives in the user's home directory on every OS:
 * Windows: C:\Users\<user>\.mcp-forge\config.json
 * macOS/Linux: ~/.mcp-forge/config.json
 */
export const CONFIG_PATH = path.join(os.homedir(), '.mcp-forge', 'config.json');

const store = new Configstore('mcp-forge', { servers: {} }, { configPath: CONFIG_PATH });

export function getServers(): Record<string, ServerEntry> {
  return store.get<Record<string, ServerEntry>>('servers') ?? {};
}

export function getServer(name: string): ServerEntry | undefined {
  return getServers()[name];
}

/** Add or replace a server entry. Writes the whole map so names may contain dots. */
export function saveServer(entry: ServerEntry): void {
  const servers = getServers();
  servers[entry.name] = entry;
  store.set('servers', servers);
}

export function removeServer(name: string): boolean {
  const servers = getServers();
  if (!(name in servers)) {
    return false;
  }
  delete servers[name];
  store.set('servers', servers);
  return true;
}

export function setServerPid(name: string, pid: number | undefined): void {
  const servers = getServers();
  const entry = servers[name];
  if (!entry) {
    return;
  }
  if (pid === undefined) {
    delete entry.pid;
  } else {
    entry.pid = pid;
  }
  store.set('servers', servers);
}
