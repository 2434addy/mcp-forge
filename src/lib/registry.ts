import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

/** How a registry entry is launched; decides the launcher and client config shape. */
export type Runtime = 'node' | 'python' | 'remote' | 'docker';

const RUNTIMES: readonly Runtime[] = ['node', 'python', 'remote', 'docker'];

/** One entry in the server catalog (src/lib/registry.json). */
export interface RegistryServer {
  name: string;
  description: string;
  /** Package identifier in the runtime's registry: npm package, PyPI package, or Docker image. */
  package: string | null;
  /** GitHub repo ("owner/repo") hosting the server, when known. */
  github: string | null;
  runtime: Runtime;
  /** Hosted endpoint, set when runtime is "remote". */
  url: string | null;
  category: string;
}

/** Concrete way to launch a server, derived from a registry entry. */
export type LaunchSpec =
  | {
      kind: 'stdio';
      /** What the launcher runs: a package name, Docker image, or "github:owner/repo" specifier. */
      target: string;
      command: string;
      args: string[];
    }
  | {
      kind: 'remote';
      /** The endpoint URL (doubles as the display/persist identifier). */
      target: string;
      url: string;
    };

/** Point this at a JSON registry (same schema as registry.json) to use a custom registry. */
const REGISTRY_URL = process.env.MCP_FORGE_REGISTRY_URL;
const FETCH_TIMEOUT_MS = 5_000;

/** Catalog shipped with the CLI; the build copies it next to this module in dist/lib. */
const BUNDLED_REGISTRY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'registry.json');

let bundledCache: RegistryServer[] | undefined;

/**
 * Validate one raw entry. `runtime` and `url` are optional in the input so
 * pre-runtime custom registries (MCP_FORGE_REGISTRY_URL) keep loading; they
 * are normalized to runtime "node" / url null.
 */
function isRegistryServer(value: unknown): value is Omit<RegistryServer, 'runtime' | 'url'> & Partial<RegistryServer> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('name' in value) || typeof value.name !== 'string') {
    return false;
  }
  if (!('description' in value) || typeof value.description !== 'string') {
    return false;
  }
  if (!('package' in value) || (typeof value.package !== 'string' && value.package !== null)) {
    return false;
  }
  if (!('github' in value) || (typeof value.github !== 'string' && value.github !== null)) {
    return false;
  }
  if (!('category' in value) || typeof value.category !== 'string') {
    return false;
  }
  if ('runtime' in value && !RUNTIMES.includes(value.runtime as Runtime)) {
    return false;
  }
  if ('url' in value && typeof value.url !== 'string' && value.url !== null && value.url !== undefined) {
    return false;
  }
  return true;
}

/** Accept either a bare array of servers or a `{ "servers": [...] }` wrapper. */
function extractServers(payload: unknown, source: string): RegistryServer[] {
  let list: unknown = payload;
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload) && 'servers' in payload) {
    list = payload.servers;
  }
  if (!Array.isArray(list)) {
    throw new Error(`${source} has no server list`);
  }
  const servers = list.filter(isRegistryServer);
  if (servers.length !== list.length) {
    throw new Error(`${source} contains ${list.length - servers.length} malformed entries`);
  }
  return servers.map((server) => ({ ...server, runtime: server.runtime ?? 'node', url: server.url ?? null }));
}

/** Load and validate the registry.json bundled with the CLI. Cached per process. */
function loadBundledRegistry(): RegistryServer[] {
  if (!bundledCache) {
    const raw = fs.readFileSync(BUNDLED_REGISTRY_PATH, 'utf8');
    bundledCache = extractServers(JSON.parse(raw), `bundled registry (${BUNDLED_REGISTRY_PATH})`);
  }
  return bundledCache;
}

/** Fetch the list of available servers, falling back to the bundled catalog. */
export async function fetchRegistry(): Promise<RegistryServer[]> {
  if (!REGISTRY_URL) {
    return loadBundledRegistry();
  }
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`registry responded with HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    return extractServers(data, REGISTRY_URL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.yellow(`warn: remote registry unavailable (${message}); using bundled catalog`));
    return loadBundledRegistry();
  }
}

/** Look a server up by registry name or npm package name. */
export async function findServer(name: string): Promise<RegistryServer | undefined> {
  const registry = await fetchRegistry();
  return registry.find((server) => server.name === name || server.package === name);
}

/**
 * Derive how to launch a registry entry from its runtime:
 * node -> npx, python -> uvx, docker -> docker run, remote -> hosted URL.
 * Node entries without a published package fall back to npx's `github:` specifier.
 */
export function resolveLaunch(server: RegistryServer): LaunchSpec {
  switch (server.runtime) {
    case 'remote': {
      if (server.url === null) {
        throw new Error(`Registry entry "${server.name}" is remote but has no url`);
      }
      return { kind: 'remote', target: server.url, url: server.url };
    }
    case 'python': {
      if (server.package === null) {
        throw new Error(
          `Registry entry "${server.name}" is a Python server without a PyPI package — cannot launch it via uvx`,
        );
      }
      return { kind: 'stdio', target: server.package, command: 'uvx', args: [server.package] };
    }
    case 'docker': {
      if (server.package === null) {
        throw new Error(`Registry entry "${server.name}" is a Docker server without an image name`);
      }
      // -i keeps stdin open (stdio transport); --rm avoids piling up exited containers.
      return { kind: 'stdio', target: server.package, command: 'docker', args: ['run', '-i', '--rm', server.package] };
    }
    case 'node': {
      if (server.package !== null) {
        return { kind: 'stdio', target: server.package, command: 'npx', args: ['-y', server.package] };
      }
      if (server.github !== null) {
        const target = `github:${server.github}`;
        return { kind: 'stdio', target, command: 'npx', args: ['-y', target] };
      }
      throw new Error(`Registry entry "${server.name}" has neither an npm package nor a GitHub repo`);
    }
  }
}
