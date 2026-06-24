import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Vercel's filesystem is read-only except /tmp.
export const DATA_DIR = process.env.VERCEL
  ? '/tmp/family-council'
  : path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'app.db');
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    family_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member',
    color TEXT NOT NULL DEFAULT '#FF6B6B',
    image TEXT,
    photo TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '⭐',
    type TEXT NOT NULL CHECK (type IN ('weekly','once')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    week_start TEXT NOT NULL,
    member_id INTEGER REFERENCES members(id),
    is_family INTEGER NOT NULL DEFAULT 0,
    day INTEGER,
    completed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (task_id, week_start)
  );
  -- One bucket per day; page views increment today's count. Used by /api/public/runops-stats.
  CREATE TABLE IF NOT EXISTS traffic_daily (
    day TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0
  );
`;

// Try node:sqlite (Node 24 built-in, local dev) then better-sqlite3 (npm, Vercel Node 20).
let db;
try {
  const { DatabaseSync } = await import('node:sqlite');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
} catch {
  const { default: Database } = await import('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
}

export default db;
