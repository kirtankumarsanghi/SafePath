import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { fromNodeSocket } from 'pg-gateway/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.PGDATA || path.join(rootDir, '.pgdata');

export async function isPortOpen(port = 5432, host = '127.0.0.1') {
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

export async function startDbServer(port = 5432, host = '127.0.0.1') {
  const alreadyRunning = await isPortOpen(port, host);
  if (alreadyRunning) {
    console.log(`[db-server] PostgreSQL is already accessible on ${host}:${port}`);
    return null;
  }

  console.log(`[db-server] Initializing PGlite database in ${dataDir}...`);
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  const server = net.createServer(async (socket) => {
    socket.on('error', () => {});
    try {
      await fromNodeSocket(socket, {
        serverVersion: '16.3',
        auth: { method: 'trust' },
        async onMessage(data, { isAuthenticated }) {
          if (!isAuthenticated) return;
          try {
            return await pglite.execProtocolRaw(data);
          } catch (err) {
            console.error('[db-server] query error:', err.message);
          }
        },
      });
    } catch {
      // client connection aborted
    }
  });

  server.on('error', (err) => {
    console.error('[db-server] server error:', err.message);
  });

  await new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`[db-server] PostgreSQL wire server listening on ${host}:${port}`);
      resolve();
    });
    server.once('error', reject);
  });

  return { server, pglite };
}

// If run directly:
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startDbServer().catch((err) => {
    console.error('[db-server] Fatal error:', err);
    process.exit(1);
  });
}
