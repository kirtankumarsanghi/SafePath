const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

function getValidNode() {
  const currentMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (currentMajor >= 20) {
    return process.execPath;
  }

  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'hermes', 'node', 'node.exe'),
    'C:\\Users\\Kirtan Kumar Sanghi\\AppData\\Local\\hermes\\node\\node.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const out = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (out.status === 0) {
          const v = parseInt(out.stdout.trim().replace(/^v/, '').split('.')[0], 10);
          if (v >= 20) return candidate;
        }
      } catch {}
    }
  }

  return process.execPath;
}

const targetNode = getValidNode();
const targetNodeDir = path.dirname(targetNode);

// If running on an outdated Node (e.g. Node 18 from system PATH), respawn with Node 22+
const currentMajor = parseInt(process.versions.node.split('.')[0], 10);
if (currentMajor < 20 && targetNode !== process.execPath) {
  const child = spawn(targetNode, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${targetNodeDir};${process.env.PATH || ''}`,
    },
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  return;
}

// Ensure PATH has Node 22 in front for all child processes
process.env.PATH = `${targetNodeDir};${process.env.PATH || ''}`;

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/app_db';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'safepath-jwt-secret-dev-2026-safe-and-secure-evacuation-planning';
}

function isPortOpen(port = 5432, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function ensureDbServer() {
  if (process.env.VERCEL || process.env.CI) return null;
  const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('127.0.0.1') || process.env.DATABASE_URL.includes('localhost');
  if (!isLocal) return null;

  const open = await isPortOpen(5432, '127.0.0.1');
  if (open) return null;

  console.log('[SafePath] Starting local PostgreSQL database service on 127.0.0.1:5432...');
  const dbScript = path.resolve(__dirname, 'db-server.mjs');
  const dbProcess = spawn(targetNode, [dbScript], {
    stdio: 'inherit',
    env: process.env,
    detached: false,
  });

  // Wait until port is open
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isPortOpen(5432, '127.0.0.1')) {
      console.log('[SafePath] PostgreSQL is ready.');
      return dbProcess;
    }
  }

  console.warn('[SafePath] Warning: database port not detected open yet.');
  return dbProcess;
}

async function main() {
  const action = process.argv[2] || 'dev';
  let dbProcess = null;

  const cleanup = () => {
    if (dbProcess) {
      try {
        dbProcess.kill();
      } catch {}
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);

  if (action === 'db') {
    const dbScript = path.resolve(__dirname, 'db-server.mjs');
    const child = spawn(targetNode, [dbScript], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  if (['dev', 'start', 'seed', 'test:e2e'].includes(action)) {
    dbProcess = await ensureDbServer();
  }

  let cmd = '';
  let args = [];

  const nextBin = path.resolve(__dirname, '../node_modules/next/dist/bin/next');

  if (action === 'dev') {
    cmd = targetNode;
    args = [nextBin, 'dev', ...process.argv.slice(3)];
  } else if (action === 'build') {
    cmd = targetNode;
    args = [nextBin, 'build', ...process.argv.slice(3)];
  } else if (action === 'start') {
    cmd = targetNode;
    args = [nextBin, 'start', ...process.argv.slice(3)];
  } else if (action === 'seed') {
    const tsxBin = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
    cmd = targetNode;
    args = [tsxBin, path.resolve(__dirname, '../src/lib/seed.ts')];
  } else if (action === 'test:unit') {
    const tsxBin = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
    cmd = targetNode;
    args = [
      tsxBin,
      '--test',
      path.resolve(__dirname, '../tests/astar.test.ts'),
      path.resolve(__dirname, '../tests/map-analysis.test.ts'),
    ];
  } else if (action === 'test:e2e') {
    const playwrightBin = path.resolve(
      __dirname,
      '../node_modules/@playwright/test/cli.js'
    );
    cmd = targetNode;
    args = [playwrightBin, 'test', ...process.argv.slice(3)];
  } else {
    // Pass arbitrary command through to npx or node
    cmd = targetNode;
    args = process.argv.slice(2);
  }

  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[SafePath] Error:', err);
  process.exit(1);
});
