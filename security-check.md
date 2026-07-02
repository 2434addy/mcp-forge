# Security Check — mcp-forge

- **Date:** 2026-07-02
- **Scope:** entire project tree (`src/`, `dist/`, `tests/`, all config files, dotfiles, `package-lock.json`), pre-GitHub-push audit
- **Method:** manual line-by-line review of all 11 source files + tests + docs, plus a 14-pattern mechanical sweep (npm `_authToken`, `npm_*`/`ghp_*`/`github_pat_*` tokens, AWS `AKIA*`, `sk-*`, Slack `xox*`, private-key blocks, JWTs, `password/secret/api-key` assignments, bearer headers, URLs with embedded credentials, hardcoded usernames, absolute home paths, e-mail addresses) across every file except `node_modules/`
- **Files scanned:** 42

## Verdict: CLEAN — zero secrets found

One repository-hygiene issue was found and fixed (see Finding 1). No hardcoded
credentials, tokens, keys, or personal data exist anywhere in the tree.

## Findings

### Finding 1 — `.gitignore` incomplete (severity: medium) — FIXED

- **File:** `.gitignore` (lines 1–3 before fix)
- **Was:** only `node_modules/`, `dist/`, `*.log`
- **Risk:** a later-created `.env`, `.env.local`, project `.npmrc` (npm auth
  token), or `.mcp-forge/` config dir (holds server `env` vars and PIDs) would
  be silently committed and pushed.
- **Fix applied:** added `.env`, `.env.local`, `.env.*.local`, `.npmrc`,
  `.mcp-forge/` to `.gitignore`.

## Checklist results

| # | Check | Result |
|---|---|---|
| 1 | Hardcoded API keys / tokens / secrets in any file | **None** — 0 hits across all 14 patterns in 42 files |
| 2 | `.env` files present | **None on disk** (`.env*` glob: empty); now gitignored anyway |
| 3 | Config files with personal data / credentials | **None** — `tsconfig.json`, `package.json`, `package-lock.json` clean; runtime config is written to `~/.mcp-forge/` (outside repo) |
| 4 | Files missing from `.gitignore` | **Fixed** — see Finding 1 |
| 5 | npm/auth token in `package.json` or config files | **None** — no `_authToken`, no `npm_*` token, no registry credentials in `package.json` or `package-lock.json` |
| 6 | `.npmrc` | **No project-level `.npmrc` exists.** A user-level `~/.npmrc` exists (normal npm login state) but lives outside the repository and cannot be pushed; the new `.npmrc` ignore entry prevents a project-level one from ever being committed |
| 7 | Hardcoded sensitive paths / usernames in source | **None** — all paths built via `os.homedir()` + `path.join`; sourcemaps in `dist/` contain relative paths only; README uses `<you>` placeholder |

## `.gitignore` coverage (final state)

| Required entry | Present |
|---|---|
| `node_modules/` | yes |
| `dist/` | yes |
| `.env` | yes (added) |
| `.env.local` | yes (added, plus `.env.*.local`) |
| `.npmrc` | yes (added) |
| `*.log` | yes |
| `.mcp-forge/` | yes (added) |

## Non-issues (reviewed, intentionally kept)

- `@2434addy/mcp-forge` package name — public npm scope, not a credential.
- `MCP_FORGE_REGISTRY_URL` (`src/lib/registry.ts:13`) — reads an env var at
  runtime; no default URL or credential embedded.
- Client config paths in `src/lib/clients.ts` — derived from
  `APPDATA`/`os.homedir()` at runtime, never hardcoded to a user.
- `dist/` exists locally but is gitignored and additionally the repo is not
  yet initialized, so nothing is mistracked.

## Regression evidence

- `npm test` (tsc build + e2e client matrix) after the fix: **ALL GREEN**.
