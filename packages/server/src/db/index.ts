import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'chat-sync.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite: DatabaseType = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
