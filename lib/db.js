import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Vercel's filesystem is read-only except /tmp (only used by the local-file backends below).
export const DATA_DIR = process.env.VERCEL ? '/tmp/family-council' : path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'app.db');

// libSQL / SQLite schema. Identical across all backends because Turso *is* SQLite.
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
  CREATE TABLE IF NOT EXISTS traffic_daily (
    day TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0
  );
`;

const SCHEMA_STATEMENTS = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean);

// Each backend exposes the same async shape: get(sql, params) -> row|undefined,
// all(sql, params) -> rows[], run(sql, params) -> { lastInsertRowid, changes }.

async function initLibsql() {
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  for (const stmt of SCHEMA_STATEMENTS) await client.execute(stmt);
  return {
    backend: 'turso',
    async get(sql, params = []) {
      return (await client.execute({ sql, args: params })).rows[0];
    },
    async all(sql, params = []) {
      return (await client.execute({ sql, args: params })).rows;
    },
    async run(sql, params = []) {
      const r = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: r.lastInsertRowid == null ? undefined : Number(r.lastInsertRowid),
        changes: Number(r.rowsAffected),
      };
    },
  };
}

function wrapSync(db) {
  return {
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
}

async function initNodeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  return { backend: 'node:sqlite', ...wrapSync(db) };
}

async function initBetterSqlite() {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return { backend: 'better-sqlite3', ...wrapSync(db) };
}

async function init() {
  // Prefer Turso whenever it's configured (this is the production path on Vercel).
  if (process.env.TURSO_DATABASE_URL) return initLibsql();
  // Local dev: Node 24's built-in SQLite needs nothing installed.
  try {
    return await initNodeSqlite();
  } catch {
    return initBetterSqlite();
  }
}

const ready = init();
ready.then((b) => console.log(`💾 Database backend: ${b.backend}`)).catch((e) => console.error('DB init failed', e));

export async function get(sql, params = []) {
  return (await ready).get(sql, params);
}
export async function all(sql, params = []) {
  return (await ready).all(sql, params);
}
export async function run(sql, params = []) {
  return (await ready).run(sql, params);
}
