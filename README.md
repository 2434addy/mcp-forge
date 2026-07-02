# mcp-forge

Install, run and manage [MCP](https://modelcontextprotocol.io) servers from one cross-platform CLI.
Works on Windows, macOS and Linux.

## Requirements

- Node.js >= 22.12

## Install

```sh
npm install
npm run build
npm link        # exposes the `mcp-forge` binary globally
```

## Commands

| Command | Description |
| --- | --- |
| `mcp-forge install [server-name]` | Install an MCP server from the registry, or a custom source via `--npm` / `--github` |
| `mcp-forge remove <server-name>` | Stop and remove an installed server |
| `mcp-forge list` | List installed servers and the full registry catalog |
| `mcp-forge update` | Refresh installed server definitions from the registry |
| `mcp-forge status` | Show which installed servers are running |
| `mcp-forge ui` | Launch the interactive TUI dashboard (Ink) |

### Example

```sh
mcp-forge install filesystem                      # from the bundled registry
mcp-forge install --npm mcp-server-kubernetes     # any npm package
mcp-forge install --github acme/cool-mcp-server   # any GitHub repo (runs via npx github:)
mcp-forge install mytool --npm some-mcp-package   # custom server name
mcp-forge status
mcp-forge ui        # ↑/↓ move · s start/stop · r refresh · q quit
```

## Configuration

State is stored in your home directory — `~/.mcp-forge/config.json`
(`C:\Users\<you>\.mcp-forge\config.json` on Windows). Paths are always built
with `path.join`, never hardcoded separators.

The catalog ships with the CLI: `src/lib/registry.json` (copied to `dist/lib`
by the build) lists 267 servers across 34 categories, each entry pointing at an
npm package and/or a GitHub repo. The CLI works fully offline.

A custom registry can be supplied via an environment variable pointing at JSON
with the same schema (a bare array or `{ "servers": [...] }`); the bundled
catalog is the fallback when the remote is unreachable:

```sh
MCP_FORGE_REGISTRY_URL=https://example.com/registry.json mcp-forge list
```

## Client auto-configuration

`mcp-forge install` also registers the server with detected MCP clients:

- **Claude Code** — `~/.claude.json`, entries written as
  `{"type": "stdio", "command": "npx", "args": [...]}`. All other keys in the
  file are preserved; only `mcpServers` is touched. Created if missing.
- **Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json` (Windows),
  `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
  `~/.config/Claude/claude_desktop_config.json` (Linux). Created if missing.
- **Cursor** — `~/.cursor/mcp.json`, configured only when `~/.cursor` exists.

Existing config keys and other `mcpServers` entries are preserved. A config
file containing invalid JSON is reported and left untouched.

## Windows notes

`src/lib/windows.ts` centralizes the platform fixes, applied automatically by
detecting `process.platform === 'win32'`:

- npm launchers (`npx`, `npm`, ...) are `.cmd` shims, so commands are spawned
  through the shell (Node >= 18.20 refuses to spawn `.cmd` directly).
- Stopping a server uses `taskkill /pid <pid> /t /f` to kill the whole process
  tree; POSIX systems signal the detached process group instead.

## Development

```sh
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
npm run dev         # tsc --watch
```

### Project structure

```
src/
  commands/   one file per CLI command (install, remove, list, update, status, ui)
  lib/
    config.ts    config at ~/.mcp-forge/config.json (Configstore)
    registry.ts    loads registry.json (bundled catalog + optional remote override)
    registry.json  server catalog: 267 servers, 34 categories
    runner.ts    start/stop server processes, PID tracking
    windows.ts   Windows-specific spawning and kill fixes
  index.ts    commander entry point
```
