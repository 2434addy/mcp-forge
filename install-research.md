# MCP Server Installation Research

Research date: 2026-07-02. Sources: official MCP registry API + JSON schema, MCP spec (2025-06-18), modelcontextprotocol.io docs, and upstream READMEs of 10 popular servers. Every config block below is copied from the cited source, not invented.

---

## 1. The Official MCP Registry

**Endpoint:** `GET https://registry.modelcontextprotocol.io/v0/servers?limit=N&search=<text>&cursor=<cursor>`

Response envelope:

```json
{
  "servers": [ { "server": { ...ServerDetail... }, "_meta": { ... } } ],
  "metadata": { "nextCursor": "com.dfetcher/vitamin-d:1.0.0", "count": 3 }
}
```

- Pagination is cursor-based (`metadata.nextCursor` → `?cursor=`).
- **One row per published version.** The same `name` appears multiple times; `_meta["io.modelcontextprotocol.registry/official"].isLatest: true` marks the current version. `_meta` also carries `status` (`active`/…), `publishedAt`, `updatedAt`.
- `search` matches text tokens (title/description), not name prefixes — `?search=io.modelcontextprotocol` returns zero rows.

### 1.1 ServerDetail fields (schema `2025-12-11/server.schema.json`)

Required: `name`, `description`, `version`.

| Field | Notes |
|---|---|
| `name` | Reverse-DNS, exactly one `/`: `io.github.user/weather`. Pattern `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$` |
| `description` | ≤100 chars |
| `version` | Exact version; ranges (`^1.2.3`, `1.x`) rejected. (The literal `latest` is additionally rejected on `Package.version`, not here) |
| `title` | Optional display name |
| `repository` | `{ url, source: "github", subfolder?, id? }` — `subfolder` locates a server inside a monorepo (e.g. `src/everything`) |
| `websiteUrl`, `icons` | Optional metadata |
| `packages[]` | How to run the server **locally** (see 1.2) |
| `remotes[]` | How to reach the server **as a hosted service** (see 1.3) |
| `_meta` | Vendor extensions, reverse-DNS namespaced |

A server may have `packages`, `remotes`, both, or neither (metadata-only). Of the first 30 live entries sampled, the majority were remotes-only SaaS servers.

### 1.2 `packages[]` — how runtime is specified

**There is no top-level "runtime" or "command" field.** Runtime is expressed by two fields on each package:

| Field | Values / meaning |
|---|---|
| `registryType` | **`npm`, `pypi`, `oci`, `nuget`, `mcpb`** — which package ecosystem to download from |
| `registryBaseUrl` | e.g. `https://registry.npmjs.org`, `https://pypi.org`, `https://docker.io`, `https://github.com` |
| `identifier` | Package name (`@modelcontextprotocol/server-brave-search`) or direct download URL (`.mcpb`) |
| `version` | Exact version (again: no ranges, no `latest`) |
| `runtimeHint` | **`npx`, `uvx`, `docker`, `dnx`** — launcher the client should use. "Hint", not a command |
| `runtimeArguments[]` | Args for the *launcher* (e.g. npx's `-y`) |
| `packageArguments[]` | Args for the *server binary itself* |
| `environmentVariables[]` | Env vars to set (see below) |
| `transport` | `{ "type": "stdio" }` \| `{ "type": "streamable-http", url, headers[] }` \| `{ "type": "sse", url, headers[] }` |
| `fileSha256` | Required for `mcpb` packages; client MUST verify before running |

So the client **constructs** the command:

```
<runtimeHint> <runtimeArguments...> <identifier[@version]> <packageArguments...>
```

Real entry observed (npm + stdio):

```json
{
  "registryType": "npm",
  "identifier": "remote-filesystem-mcp-server",
  "version": "0.1.5",
  "runtimeHint": "npx",
  "transport": { "type": "stdio" },
  "runtimeArguments": [ { "value": "-y", "type": "positional" } ],
  "environmentVariables": [
    { "name": "GCS_BUCKET", "description": "…", "isRequired": true },
    { "name": "GCS_PRIVATE_KEY", "description": "…", "isSecret": true },
    { "name": "GCS_MAKE_PUBLIC", "default": "false" }
  ]
}
```

Also observed: `registryType: "oci"` with `identifier: "digitaldefiance/mcp-filesystem:latest"` (Docker image, stdio transport).

**Arguments model.** `packageArguments`/`runtimeArguments` entries are either
- *positional*: `{ "type": "positional", "value": "-y" }` or `{ "type": "positional", "valueHint": "file_path" }` (valueHint = label for a user-supplied value), or
- *named*: `{ "type": "named", "name": "--port", "value": "8080", "isRepeated": false }`.

Values support `{curly_brace}` variable substitution against a `variables` map. Env vars, args, and header values all share the same `Input` shape: `{ name, description, isRequired (default false), isSecret (default false), default, placeholder, choices[], format: "string"|"number"|"boolean"|"filepath" }`.

**Security note baked into the schema:** argument values are user-provided strings → command-injection risk. Clients should prefer non-shell spawning (`posix_spawn`-style) and/or ask consent before running the resolved command.

### 1.3 `remotes[]` — hosted servers

```json
"remotes": [
  {
    "type": "streamable-http",          // or "sse"
    "url": "https://api.adadvisor.ai/mcp",
    "headers": [
      { "name": "Authorization", "description": "Bearer token (adv_sk_...)",
        "isRequired": true, "isSecret": true }
    ]
  }
]
```

- `type` is only ever `streamable-http` or `sse` (stdio is impossible remotely).
- `url` may be a template with `{variables}`.
- Header values reuse the `Input` shape (`isSecret` for tokens); Smithery-hosted entries template them: `"value": "Bearer {smithery_api_key}"`.

---

## 2. Ten Popular Servers: Runtime + Exact Config

Verified against each project's own README / install docs.

| # | Server | Runtime | Distribution | Launcher |
|---|--------|---------|--------------|----------|
| 1 | filesystem | Node | npm `@modelcontextprotocol/server-filesystem` | `npx -y` |
| 2 | memory | Node | npm `@modelcontextprotocol/server-memory` | `npx -y` |
| 3 | sequential-thinking | Node | npm `@modelcontextprotocol/server-sequential-thinking` | `npx -y` |
| 4 | everything | Node | npm `@modelcontextprotocol/server-everything` | `npx -y` |
| 5 | git | Python | PyPI `mcp-server-git` | `uvx` (or pip + `python -m`) |
| 6 | fetch | Python | PyPI `mcp-server-fetch` | `uvx` / docker `mcp/fetch` / pip |
| 7 | time | Python | PyPI `mcp-server-time` | `uvx` / pip |
| 8 | github | **Go** | Remote HTTP, Docker image `ghcr.io/github/github-mcp-server`, or release binary | **not npx-able** |
| 9 | playwright | Node | npm `@playwright/mcp` | `npx` (`@latest` tag, no `-y`) |
| 10 | context7 | Node | npm `@upstash/context7-mcp` **or** remote `https://mcp.context7.com/mcp` | `npx` or remote |

### Exact `claude_desktop_config.json` entries (from upstream docs)

**1. filesystem** — requires ≥1 positional arg (allowed directories):

```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Desktop", "/Users/username/Downloads"]
}
```

**2. memory / 3. sequential-thinking / 4. everything** — zero-config Node servers:

```json
"memory": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"] }
```

**5. git** — Python, optional named arg:

```json
"git": { "command": "uvx", "args": ["mcp-server-git", "--repository", "path/to/git/repo"] }
```

**6. fetch** — Python, three documented install paths:

```json
"fetch": { "command": "uvx", "args": ["mcp-server-fetch"] }
// or: { "command": "docker", "args": ["run", "-i", "--rm", "mcp/fetch"] }
// or (pip): { "command": "python", "args": ["-m", "mcp_server_fetch"] }
```

**7. time** — Python: `{ "command": "uvx", "args": ["mcp-server-time"] }` (pip alternative `python -m mcp_server_time`).

**8. github** — three official options (from `docs/installation-guides/install-claude.md`):

```json
// (a) Remote streamable HTTP — preferred
{ "type": "http", "url": "https://api.githubcopilot.com/mcp", 
  "headers": { "Authorization": "Bearer YOUR_GITHUB_PAT" } }

// (b) Local via Docker
{ "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PAT" } }

// (c) Local via release binary on PATH
{ "command": "github-mcp-server", "args": ["stdio"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PAT" } }
```

**9. playwright** — note `@latest` and no `-y`:

```json
"playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }
```

**10. context7** — dual-mode. Remote (recommended): URL `https://mcp.context7.com/mcp` with `CONTEXT7_API_KEY` header; local: npm package `@upstash/context7-mcp`. Ships its own installer (`npx ctx7 setup`).

### Env-var pattern (from official servers README)

```json
"github": {
  "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
}
```

### How Claude Desktop's docs say to install (modelcontextprotocol.io "Connect to local MCP servers")

1. Edit config via Settings → Developer → Edit Config. File locations:
   - macOS `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows `%APPDATA%\Claude\claude_desktop_config.json`
2. Add an entry under `"mcpServers"` with `command`/`args` (`-y` explained as "automatically confirms installation"); paths must be **absolute**.
3. Fully restart Claude Desktop.
4. Debugging: logs at `%APPDATA%\Claude\logs\mcp-server-<NAME>.log` (Windows) / `~/Library/Logs/Claude` (macOS); test by running the exact command manually.

**Windows-specific caveats (both from official docs):**
- servers README: wrap npx in cmd — `{ "command": "cmd", "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"] }`; leave `uvx` entries unchanged.
- Claude Desktop troubleshooting: if logs show a literal `${APPDATA}` in paths, add expanded `"APPDATA": "C:\\Users\\user\\AppData\\Roaming\\"` to the entry's `env`; npm must be installed globally.

---

## 3. Transport Types (spec 2025-06-18)

Two standard transports; clients SHOULD support stdio whenever possible.

### stdio
- Client launches the server **as a subprocess**; JSON-RPC messages are newline-delimited UTF-8 on stdin/stdout; stderr is free-form logging.
- Server MUST NOT write non-MCP bytes to stdout (why spinners/banner prints break servers).
- Client config shape: `{ "command", "args", "env" }`.

### Streamable HTTP
- Server is an independent process exposing a **single MCP endpoint** (e.g. `https://example.com/mcp`) supporting POST (every client→server JSON-RPC message) and GET (open an SSE stream for server→client messages).
- POST responses are either `application/json` (single response) or `text/event-stream` (SSE stream carrying the response, possibly after server-initiated requests/notifications).
- Sessions via `Mcp-Session-Id` header (assigned at initialize, echoed on all later requests, DELETE to end); resumability via SSE event ids + `Last-Event-ID`.
- `MCP-Protocol-Version` header required on every request after initialize.
- Security: MUST validate `Origin` (DNS-rebinding), SHOULD bind localhost-only when local, SHOULD authenticate.
- Client config shape (Claude Code): `{ "type": "http", "url", "headers" }`.

### HTTP+SSE (deprecated)
- Protocol version 2024-11-05 transport (separate SSE + POST endpoints), **replaced by Streamable HTTP**. Still appears as `"type": "sse"` in registry remotes and older client configs. The spec documents a client fallback: POST InitializeRequest → on 4xx, GET expecting an SSE `endpoint` event.

### Custom transports
- Permitted; must preserve JSON-RPC message format and lifecycle.

**Command-format mapping:** stdio → local launcher (`npx`/`uvx`/`docker run -i --rm`/binary); streamable-http & sse → no local command at all, just URL + headers. For clients that only speak stdio config, remote servers are bridged with `npx -y mcp-remote <url>` (community shim) — not needed for Claude Code/Cursor which support `type: http` natively.

---

## 4. What this means for mcp-forge (summary)

1. **Runtime is per-package metadata, not guessable from a repo URL.** The official vocabulary is `registryType` (npm/pypi/oci/nuget/mcpb) + `runtimeHint` (npx/uvx/docker/dnx). mcp-forge's `npx -y github:owner/repo` assumption only holds for Node repos with a valid root `package.json` + `bin`.
2. **Python servers are ubiquitous** among the most-installed servers (fetch, git, time) and require `uvx` (or `pip` + `python -m`). None are npx-able.
3. **Some flagship servers have no npm/pypi package at all** (github = Go binary/Docker/remote; many registry entries are remotes-only SaaS).
4. **Env vars are first-class**: required vs optional, secret vs plain, defaults — and land in the client entry's `env` key (stdio) or `headers` (remote).
5. **Args are first-class**: filesystem *requires* user-supplied positional dirs; git takes `--repository`. An install flow with no arg support produces broken entries for these.
6. **Monorepo subfolders**: the official schema has `repository.subfolder`; `github:owner/repo` npx specifiers cannot express it.
7. **Windows needs the `cmd /c` wrap** for npx-based entries per official guidance (or an equivalent), plus the APPDATA env workaround.
