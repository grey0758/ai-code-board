import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { syncRoutes } from './api/sync.js';
import { machineRoutes } from './api/machines.js';
import { queryRoutes } from './api/query.js';
import { remoteRoutes } from './api/remote.js';
import { setupWebSocket } from './ws/index.js';
import { sqlite } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run migrations inline
const migrationSQL = [
  `CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY, hostname TEXT NOT NULL, ip_address TEXT NOT NULL,
    os_info TEXT, ssh_port INTEGER DEFAULT 22, ssh_user TEXT,
    watch_dirs TEXT NOT NULL, agent_version TEXT,
    is_online INTEGER DEFAULT 0, last_heartbeat TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT NOT NULL, machine_id TEXT NOT NULL,
    project_path TEXT NOT NULL, source TEXT NOT NULL, file_path TEXT NOT NULL,
    message_count INTEGER DEFAULT 0, first_message_at TEXT, last_message_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, machine_id),
    FOREIGN KEY (machine_id) REFERENCES machines(id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL, machine_id TEXT NOT NULL,
    line_number INTEGER NOT NULL, type TEXT NOT NULL,
    content TEXT, raw_json TEXT, timestamp TEXT, synced_at TEXT NOT NULL,
    UNIQUE(machine_id, session_id, line_number)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_offsets (
    machine_id TEXT NOT NULL, file_path TEXT NOT NULL,
    byte_offset INTEGER DEFAULT 0, line_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (machine_id, file_path)
  )`,
  `CREATE TABLE IF NOT EXISTS dashboard_cursors (
    client_id TEXT PRIMARY KEY, last_message_id INTEGER DEFAULT 0, updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(machine_id, session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_synced ON messages(synced_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_machine ON sessions(machine_id)`,
  // Add display_name column if not exists
  `ALTER TABLE machines ADD COLUMN display_name TEXT`,
  // Session metadata columns
  `ALTER TABLE sessions ADD COLUMN display_name TEXT`,
  `ALTER TABLE sessions ADD COLUMN first_message TEXT`,
  `ALTER TABLE sessions ADD COLUMN is_starred INTEGER DEFAULT 0`,
  `ALTER TABLE sessions ADD COLUMN is_watched INTEGER DEFAULT 0`,
];

for (const sql of migrationSQL) {
  try {
    sqlite.exec(sql);
  } catch (e: any) {
    // Ignore "duplicate column" errors from ALTER TABLE
    if (!e.message?.includes('duplicate column')) throw e;
  }
}
console.log('[DB] Migrations applied.');

const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 }); // 50MB

async function start() {
  await app.register(cors, { origin: true });
  await app.register(websocket);

  await app.register(syncRoutes);
  await app.register(machineRoutes);
  await app.register(queryRoutes);
  await app.register(remoteRoutes);
  await app.register(setupWebSocket);

  // Serve frontend static files
  const webDistPath = join(__dirname, '../../web/dist');
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws/')) {
        reply.code(404).send({ error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
    console.log(`[Server] Serving frontend from ${webDistPath}`);
  }

  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000');

  await app.listen({ host, port });
  console.log(`[Server] Running at http://${host}:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
