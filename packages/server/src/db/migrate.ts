import { sqlite } from './index.js';

const migrations = [
  `CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    os_info TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT,
    watch_dirs TEXT NOT NULL,
    agent_version TEXT,
    is_online INTEGER DEFAULT 0,
    last_heartbeat TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    source TEXT NOT NULL,
    file_path TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    first_message_at TEXT,
    last_message_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, machine_id),
    FOREIGN KEY (machine_id) REFERENCES machines(id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    raw_json TEXT,
    timestamp TEXT,
    synced_at TEXT NOT NULL,
    UNIQUE(machine_id, session_id, line_number)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_offsets (
    machine_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    byte_offset INTEGER DEFAULT 0,
    line_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (machine_id, file_path)
  )`,
  `CREATE TABLE IF NOT EXISTS dashboard_cursors (
    client_id TEXT PRIMARY KEY,
    last_message_id INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(machine_id, session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_synced ON messages(synced_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_machine ON sessions(machine_id)`,
];

console.log('Running migrations...');
for (const sql of migrations) {
  sqlite.exec(sql);
}
console.log('Migrations complete.');
process.exit(0);
