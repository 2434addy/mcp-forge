import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const results = [];

function runCli(home, ...args) {
  return spawnSync('node', ['dist/index.js', ...args], {
    env: {
      ...process.env,
      USERPROFILE: home,
      HOME: home,
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

// 1. fresh: no config files, .cursor present -> all three clients configured
{
  const home = tempHome('fresh');
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  const r = runCli(home, 'install', 'memory');
  const codePath = path.join(home, '.claude.json');
  const desktopPath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const cursorPath = path.join(home, '.cursor', 'mcp.json');
  let ok = r.status === 0 && fs.existsSync(codePath) && fs.existsSync(desktopPath) && fs.existsSync(cursorPath);
  if (ok) {
    const code = JSON.parse(fs.readFileSync(codePath, 'utf8'));
    const desktop = JSON.parse(fs.readFileSync(desktopPath, 'utf8'));
    const cursor = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    ok =
      JSON.stringify(code.mcpServers.memory) ===
        JSON.stringify({ type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }) &&
      JSON.stringify(desktop.mcpServers.memory) ===
        JSON.stringify({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }) &&
      cursor.mcpServers.memory.command === 'npx' &&
      r.stdout.includes('✓ Configured in Claude Code') &&
      r.stdout.includes('✓ Configured in Claude Desktop') &&
      r.stdout.includes('✓ Configured in Cursor');
  }
  check('fresh: all three clients configured', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 2. merge: pre-seeded claude configs with foreign keys, no .cursor
{
  const home = tempHome('merge');
  const desktopPath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true });
  fs.writeFileSync(
    desktopPath,
    JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'foo', args: ['--bar'] } } }),
    'utf8',
  );
  const codePath = path.join(home, '.claude.json');
  const codeSeed = {
    numStartups: 42,
    installMethod: 'npm',
    projects: { 'C:/work/app': { allowedTools: ['Bash'], history: [{ display: 'hi' }] } },
    oauthAccount: { accountUuid: 'abc-123', emailAddress: 'adi@example.com' },
    mcpServers: { other: { type: 'stdio', command: 'foo', args: ['--bar'] } },
  };
  fs.writeFileSync(codePath, JSON.stringify(codeSeed), 'utf8');
  const r = runCli(home, 'install', 'memory');
  const desktop = JSON.parse(fs.readFileSync(desktopPath, 'utf8'));
  const code = JSON.parse(fs.readFileSync(codePath, 'utf8'));
  const ok =
    r.status === 0 &&
    desktop.globalShortcut === 'Ctrl+Space' &&
    JSON.stringify(desktop.mcpServers.other) === JSON.stringify({ command: 'foo', args: ['--bar'] }) &&
    desktop.mcpServers.memory.command === 'npx' &&
    code.numStartups === 42 &&
    code.installMethod === 'npm' &&
    JSON.stringify(code.projects) === JSON.stringify(codeSeed.projects) &&
    JSON.stringify(code.oauthAccount) === JSON.stringify(codeSeed.oauthAccount) &&
    JSON.stringify(code.mcpServers.other) === JSON.stringify(codeSeed.mcpServers.other) &&
    JSON.stringify(code.mcpServers.memory) ===
      JSON.stringify({ type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }) &&
    r.stdout.includes('not detected') &&
    !fs.existsSync(path.join(home, '.cursor', 'mcp.json'));
  check('merge: foreign keys preserved in both claude configs, cursor skipped', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 3 + 4. corrupt: invalid JSON in both claude configs left untouched across two installs, exit 0 both times
{
  const home = tempHome('corrupt');
  const desktopPath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const codePath = path.join(home, '.claude.json');
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true });
  const corrupt = '{ this is not json';
  fs.writeFileSync(desktopPath, corrupt, 'utf8');
  fs.writeFileSync(codePath, corrupt, 'utf8');

  const r1 = runCli(home, 'install', 'memory');
  check(
    'corrupt: refused, untouched, install exit 0',
    r1.status === 0 &&
      fs.readFileSync(desktopPath, 'utf8') === corrupt &&
      fs.readFileSync(codePath, 'utf8') === corrupt &&
      r1.stdout.includes('left untouched') &&
      (r1.stdout + r1.stderr).includes('Installed'),
    `status=${r1.status} stdout=${r1.stdout}`,
  );

  const r2 = runCli(home, 'install', 'filesystem');
  check(
    'second install: corrupt files still untouched',
    r2.status === 0 &&
      fs.readFileSync(desktopPath, 'utf8') === corrupt &&
      fs.readFileSync(codePath, 'utf8') === corrupt &&
      r2.stdout.includes('left untouched'),
    `status=${r2.status} stdout=${r2.stdout}`,
  );
}

// 5. remove: entry deleted from all clients, foreign keys preserved
{
  const home = tempHome('rm');
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  const desktopPath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const codePath = path.join(home, '.claude.json');
  const cursorPath = path.join(home, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true });
  fs.writeFileSync(
    desktopPath,
    JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'foo', args: ['--bar'] } } }),
    'utf8',
  );
  fs.writeFileSync(codePath, JSON.stringify({ numStartups: 7, mcpServers: {} }), 'utf8');
  runCli(home, 'install', 'memory');
  const r = runCli(home, 'remove', 'memory');
  const desktop = JSON.parse(fs.readFileSync(desktopPath, 'utf8'));
  const code = JSON.parse(fs.readFileSync(codePath, 'utf8'));
  const cursor = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
  const ok =
    r.status === 0 &&
    !('memory' in desktop.mcpServers) &&
    JSON.stringify(desktop.mcpServers.other) === JSON.stringify({ command: 'foo', args: ['--bar'] }) &&
    desktop.globalShortcut === 'Ctrl+Space' &&
    !('memory' in code.mcpServers) &&
    code.numStartups === 7 &&
    !('memory' in cursor.mcpServers) &&
    r.stdout.includes('✓ Removed from Claude Code') &&
    r.stdout.includes('✓ Removed from Claude Desktop') &&
    r.stdout.includes('✓ Removed from Cursor');
  check('remove: deleted from all clients, foreign keys preserved', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 6. remove: corrupt claude config left untouched, remove still exit 0
{
  const home = tempHome('rmcorrupt');
  const claudePath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  const corrupt = '{ this is not json';
  fs.writeFileSync(claudePath, corrupt, 'utf8');
  runCli(home, 'install', 'memory');
  const r = runCli(home, 'remove', 'memory');
  const ok =
    r.status === 0 &&
    fs.readFileSync(claudePath, 'utf8') === corrupt &&
    r.stdout.includes('left untouched') &&
    (r.stdout + r.stderr).includes('Removed');
  check('remove: corrupt config untouched, exit 0', ok, `status=${r.status} stdout=${r.stdout}`);
}

// 7. remove: missing file / missing entry -> skipped, exit 0, nothing created
{
  const home = tempHome('rmskip');
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  const claudePath = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const cursorPath = path.join(home, '.cursor', 'mcp.json');
  runCli(home, 'install', 'memory');
  fs.rmSync(claudePath);
  fs.writeFileSync(cursorPath, `${JSON.stringify({ mcpServers: {} })}\n`, 'utf8');
  const r = runCli(home, 'remove', 'memory');
  const ok =
    r.status === 0 &&
    !fs.existsSync(claudePath) &&
    r.stdout.includes('no config file') &&
    r.stdout.includes('not configured');
  check('remove: missing file / entry skipped, nothing created, exit 0', ok, `status=${r.status} stdout=${r.stdout}`);
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
