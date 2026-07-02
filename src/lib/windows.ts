import { spawnSync } from 'node:child_process';

/** True when running on Windows. All platform-specific fixes key off this flag. */
export const isWindows = process.platform === 'win32';

export interface SpawnCommand {
  command: string;
  args: string[];
  shell: boolean;
}

/**
 * Prepare a command for cross-platform spawning.
 *
 * On Windows, npm-ecosystem launchers ("npx", "npm", ...) are `.cmd` shims that
 * can only run through cmd.exe — Node >= 18.20 refuses to spawn them directly
 * (CVE-2024-27980). The command line is pre-joined here (quoting tokens that
 * contain whitespace) and handed to the shell as a single string, which avoids
 * Node's DEP0190 warning about unescaped args. On POSIX we spawn directly,
 * which keeps signal handling sane.
 */
export function toSpawnCommand(command: string, args: string[]): SpawnCommand {
  if (isWindows) {
    const commandLine = [command, ...args]
      .map((token) => (/\s/.test(token) ? `"${token}"` : token))
      .join(' ');
    return { command: commandLine, args: [], shell: true };
  }
  return { command, args, shell: false };
}

/** Check whether a PID refers to a live process (works on Windows and POSIX). */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 only tests for existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process and its children.
 *
 * Windows has no POSIX process groups, so `taskkill /t` takes down the whole
 * tree (npx spawns the real server as a child process). On POSIX the detached
 * process group is signalled first, falling back to the single PID.
 */
export function killProcessTree(pid: number): boolean {
  if (isWindows) {
    const result = spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return result.status === 0;
  }
  try {
    process.kill(-pid, 'SIGTERM'); // negative PID targets the process group
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }
}
