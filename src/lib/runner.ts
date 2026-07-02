import { spawn } from 'node:child_process';
import { getServer, setServerPid } from './config.js';
import { isProcessAlive, isWindows, killProcessTree, toSpawnCommand } from './windows.js';

export interface RunningServer {
  name: string;
  pid: number;
}

/**
 * Start an installed MCP server as a detached background process and record
 * its PID in the config so `status`, `ui` and `remove` can find it later.
 */
export function startServer(name: string): RunningServer {
  const entry = getServer(name);
  if (!entry) {
    throw new Error(`Server "${name}" is not installed. Run: mcp-forge install ${name}`);
  }
  if (entry.pid !== undefined && isProcessAlive(entry.pid)) {
    return { name, pid: entry.pid };
  }

  if (entry.command === undefined) {
    throw new Error(`"${name}" is a remote server (${entry.url ?? entry.package}) — there is no local process to start`);
  }
  const { command, args, shell } = toSpawnCommand(entry.command, entry.args ?? []);
  const child = spawn(command, args, {
    shell,
    stdio: 'ignore',
    detached: !isWindows, // POSIX: own process group; Windows: avoid spawning a new console
    windowsHide: true,
    env: { ...process.env, ...entry.env },
  });
  if (typeof child.pid !== 'number') {
    throw new Error(`Failed to start "${name}" (${[command, ...args].join(' ')})`);
  }
  child.unref(); // let the CLI exit while the server keeps running
  setServerPid(name, child.pid);
  return { name, pid: child.pid };
}

/** Stop a server started by mcp-forge. Returns true when a live process was killed. */
export function stopServer(name: string): boolean {
  const entry = getServer(name);
  if (!entry || entry.pid === undefined) {
    return false;
  }
  const killed = isProcessAlive(entry.pid) ? killProcessTree(entry.pid) : false;
  setServerPid(name, undefined);
  return killed;
}

/** True when the recorded PID for the server is still alive. */
export function isRunning(name: string): boolean {
  const entry = getServer(name);
  return entry?.pid !== undefined && isProcessAlive(entry.pid);
}
