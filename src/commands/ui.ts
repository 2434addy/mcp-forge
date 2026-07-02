import { createElement as e, useEffect, useState, type ReactElement } from 'react';
import { Box, render, Text, useApp, useInput } from 'ink';
import chalk from 'chalk';
import { getServers, type ServerEntry } from '../lib/config.js';
import { isRunning, startServer, stopServer } from '../lib/runner.js';

interface Row {
  entry: ServerEntry;
  running: boolean;
}

function loadRows(): Row[] {
  return Object.values(getServers()).map((entry) => ({ entry, running: isRunning(entry.name) }));
}

const HELP = '↑/↓ move · s start/stop · r refresh · q quit';
const REFRESH_INTERVAL_MS = 2_000;

function Dashboard(): ReactElement {
  const { exit } = useApp();
  const [rows, setRows] = useState<Row[]>(loadRows);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState(HELP);

  useEffect(() => {
    const timer = setInterval(() => setRows(loadRows()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor((current) => Math.max(0, current - 1));
    }
    if (key.downArrow || input === 'j') {
      setCursor((current) => Math.min(Math.max(rows.length - 1, 0), current + 1));
    }
    if (input === 'r') {
      setRows(loadRows());
      setMessage(HELP);
    }
    if (input === 's') {
      const row = rows[cursor];
      if (!row) {
        return;
      }
      try {
        if (row.running) {
          stopServer(row.entry.name);
          setMessage(`Stopped ${row.entry.name}`);
        } else {
          const started = startServer(row.entry.name);
          setMessage(`Started ${row.entry.name} (pid ${started.pid})`);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
      setRows(loadRows());
    }
  });

  return e(
    Box,
    { flexDirection: 'column', paddingX: 1 },
    e(Text, { bold: true, color: 'magenta' }, 'mcp-forge dashboard'),
    rows.length === 0
      ? e(Text, { dimColor: true }, 'No servers installed. Run "mcp-forge install <server-name>" first.')
      : rows.map((row, index) =>
          e(
            Text,
            { key: row.entry.name, inverse: index === cursor },
            `${index === cursor ? '▸' : ' '} ${row.entry.name.padEnd(24)} ${
              row.running ? '● running' : '○ stopped'
            }  ${row.entry.package}`,
          ),
        ),
    e(Text, { dimColor: true }, message),
  );
}

export async function uiCommand(): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(chalk.red('mcp-forge ui requires an interactive terminal (TTY).'));
    process.exitCode = 1;
    return;
  }
  const app = render(e(Dashboard));
  await app.waitUntilExit();
}
