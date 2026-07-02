import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const results = [];

function runInstall(home, serverName) {
  return spawnSync('node', ['dist/index.js', 'install', serverName], {
    env: {
      ...process.env,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData', 'Roaming'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function tempHome(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `forge-${tag}-`));
}

function check(name, ok, detail) {
  results.push({ name, ok, detail: ok ? '' : detail });
}

// 1. fresh: no claude file, .cursor present -> both clients configured
{
  const home = tempHome('fresh');
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  const r = runInstall(home, 'memory');
  const claudePath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const cursorPath = path.join(home, '.cursor', 'mcp.json');
  let ok = r.status === 0 && fs.existsSync(claudePath) && fs.existsSync(cursorPath);
  if (ok) {
    const claude = JSON.parse(fs.readFileSync(claudePath, 'utf8'));
    const cursor = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    ok =
      JSON.stringify(claude.mcpServers.memory) ===
        JSON.stringify({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }) &&
      cursor.mcpServers.memory.command === 'npx' &&
      r.stdout.includes('✓ Configured in Claude Code') &&
      r.stdout.includes('✓ Configured in Cursor');
  }
  check('fresh: both clients configured', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 2. merge: pre-seeded claude config with foreign keys, no .cursor
{
  const home = tempHome('merge');
  const claudePath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.writeFileSync(
    claudePath,
    JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'foo', args: ['--bar'] } } }),
    'utf8',
  );
  const r = runInstall(home, 'memory');
  const claude = JSON.parse(fs.readFileSync(claudePath, 'utf8'));
  const ok =
    r.status === 0 &&
    claude.globalShortcut === 'Ctrl+Space' &&
    JSON.stringify(claude.mcpServers.other) === JSON.stringify({ command: 'foo', args: ['--bar'] }) &&
    claude.mcpServers.memory.command === 'npx' &&
    r.stdout.includes('not detected') &&
    !fs.existsSync(path.join(home, '.cursor', 'mcp.json'));
  check('merge: foreign keys preserved, cursor skipped', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 3 + 4. corrupt: invalid JSON left untouched across two installs, exit 0 both times
{
  const home = tempHome('corrupt');
  const claudePath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  const corrupt = '{ this is not json';
  fs.writeFileSync(claudePath, corrupt, 'utf8');

  const r1 = runInstall(home, 'memory');
  check(
    'corrupt: refused, untouched, install exit 0',
    r1.status === 0 &&
      fs.readFileSync(claudePath, 'utf8') === corrupt &&
      r1.stdout.includes('left untouched') &&
      (r1.stdout + r1.stderr).includes('Installed'),
    `status=${r1.status} stdout=${r1.stdout}`,
  );

  const r2 = runInstall(home, 'filesystem');
  check(
    'second install: corrupt file still untouched',
    r2.status === 0 && fs.readFileSync(claudePath, 'utf8') === corrupt && r2.stdout.includes('left untouched'),
    `status=${r2.status} stdout=${r2.stdout}`,
  );
}

let failed = false;
for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) {
    failed = true;
    console.log(`  detail: ${detail}`);
  }
}
if (failed) {
  process.exit(1);
}
console.log('E2E MATRIX: ALL GREEN');
