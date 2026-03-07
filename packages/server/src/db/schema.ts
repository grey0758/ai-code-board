import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const machines = sqliteTable('machines', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull(),
  displayName: text('display_name'),
  ipAddress: text('ip_address').notNull(),
  osInfo: text('os_info'),
  sshPort: integer('ssh_port').default(22),
  sshUser: text('ssh_user'),
  watchDirs: text('watch_dirs').notNull(), // JSON array string
  agentVersion: text('agent_version'),
  isOnline: integer('is_online', { mode: 'boolean' }).default(false),
  lastHeartbeat: text('last_heartbeat'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').notNull(),
  machineId: text('machine_id').notNull().references(() => machines.id),
  projectPath: text('project_path').notNull(),
  source: text('source').notNull(), // 'claude' | 'codex' | 'openclaw'
  filePath: text('file_path').notNull(),
  messageCount: integer('message_count').default(0),
  firstMessageAt: text('first_message_at'),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
  displayName: text('display_name'),
  firstMessage: text('first_message'),
  isStarred: integer('is_starred', { mode: 'boolean' }).default(false),
  isWatched: integer('is_watched', { mode: 'boolean' }).default(false),
});
// Note: composite primary key (id, machineId) - handle in migration

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  machineId: text('machine_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  type: text('type').notNull(),
  content: text('content'),
  rawJson: text('raw_json'), // JSON string
  timestamp: text('timestamp'),
  syncedAt: text('synced_at').notNull(),
});

export const syncOffsets = sqliteTable('sync_offsets', {
  machineId: text('machine_id').notNull(),
  filePath: text('file_path').notNull(),
  byteOffset: integer('byte_offset').default(0),
  lineCount: integer('line_count').default(0),
  updatedAt: text('updated_at').notNull(),
});

export const dashboardCursors = sqliteTable('dashboard_cursors', {
  clientId: text('client_id').primaryKey(),
  lastMessageId: integer('last_message_id').default(0),
  updatedAt: text('updated_at').notNull(),
});
