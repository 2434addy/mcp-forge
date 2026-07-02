import chalk from 'chalk';

export interface RegistryServer {
  name: string;
  description: string;
  package: string;
  command: string;
  args: string[];
  version?: string;
}

/** Point this at a raw JSON array of RegistryServer objects to use a custom registry. */
const REGISTRY_URL = process.env.MCP_FORGE_REGISTRY_URL;
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Built-in catalog of well-known MCP servers. Used when no remote registry is
 * configured or the remote is unreachable, so the CLI works offline.
 */
const BUILTIN_REGISTRY: RegistryServer[] = [
  {
    name: 'filesystem',
    description: 'Read and write files under allowed directories',
    package: '@modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
  {
    name: 'memory',
    description: 'Knowledge-graph based persistent memory',
    package: '@modelcontextprotocol/server-memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    name: 'sequential-thinking',
    description: 'Structured step-by-step problem solving',
    package: '@modelcontextprotocol/server-sequential-thinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
  {
    name: 'everything',
    description: 'Reference server exercising every MCP feature',
    package: '@modelcontextprotocol/server-everything',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
  },
  {
    name: 'github',
    description: 'GitHub repositories, issues and pull requests',
    package: '@modelcontextprotocol/server-github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
];

/** Fetch the list of available servers, falling back to the built-in catalog. */
export async function fetchRegistry(): Promise<RegistryServer[]> {
  if (!REGISTRY_URL) {
    return BUILTIN_REGISTRY;
  }
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`registry responded with HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('registry payload is not a JSON array');
    }
    return data as RegistryServer[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.yellow(`warn: remote registry unavailable (${message}); using built-in catalog`));
    return BUILTIN_REGISTRY;
  }
}

/** Look a server up by registry name or npm package name. */
export async function findServer(name: string): Promise<RegistryServer | undefined> {
  const registry = await fetchRegistry();
  return registry.find((server) => server.name === name || server.package === name);
}
