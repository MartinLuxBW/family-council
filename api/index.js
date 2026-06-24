import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db, { UPLOADS_DIR } from '../lib/db.js';
import { hashPassword, verifyPassword, sessionCookie, clearCookie, userFromRequest } from '../lib/auth.js';
import { generateAvatar } from '../lib/imagegen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const ALLOWED_UPLOADS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// RunOps stats endpoint secret. MUST be provided via the RUNOPS_KEY env var
// (Vercel dashboard in prod, .env.local locally) — never hardcoded, so it stays out of the repo.
// If unset, the endpoint is disabled (fails closed).
const RUNOPS_KEY = process.env.RUNOPS_KEY || '';

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Increment today's page-view bucket. Wrapped so a stats failure never breaks page serving.
function recordPageView() {
  try {
    db.prepare(
      `INSERT INTO traffic_daily (day, hits) VALUES (date('now'), 1)
       ON CONFLICT(day) DO UPDATE SET hits = hits + 1`
    ).run();
  } catch (err) {
    console.error('traffic record failed', err);
  }
}

function json(res, status, obj, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function sendFile(res, file, cache = false) {
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    ...(cache ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {}),
  });
  fs.createReadStream(file).pipe(res);
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too-big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  try { return JSON.parse((await readBody(req)).toString()); } catch { return {}; }
}

const INSTANCE_SELECT = `
  SELECT i.id, i.task_id, i.member_id, i.is_family, i.day, i.completed, i.week_start,
         t.title, t.emoji, t.type
  FROM instances i JOIN tasks t ON t.id = i.task_id`;

// ---------- API handlers ----------

const api = {
  'POST /api/auth/signup': async (req, res) => {
    const { familyName, email, password } = await readJson(req);
    if (!familyName?.trim() || !email?.trim() || !password || password.length < 6) {
      return json(res, 400, { error: 'Please fill in everything — password needs at least 6 characters.' });
    }
    const mail = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(mail)) {
      return json(res, 409, { error: 'That email is already signed up. Try logging in!' });
    }
    const r = db.prepare('INSERT INTO users (email, password_hash, family_name) VALUES (?, ?, ?)')
      .run(mail, hashPassword(password), familyName.trim());
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(r.lastInsertRowid) });
  },

  'POST /api/auth/login': async (req, res) => {
    const { email, password } = await readJson(req);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.trim().toLowerCase() ?? '');
    if (!user || !verifyPassword(password ?? '', user.password_hash)) {
      return json(res, 401, { error: "Email or password doesn't match." });
    }
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(user.id) });
  },

  'POST /api/auth/logout': async (req, res) => {
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  },

  'GET /api/me': async (req, res, user) => {
    json(res, 200, { user: user ? { email: user.email, familyName: user.family_name } : null });
  },

  // Stats for the RunOps monitoring tool. Auth via x-runops-key header (constant-time compared).
  'GET /api/public/runops-stats': async (req, res) => {
    if (!RUNOPS_KEY) {
      return json(res, 503, { error: 'Stats endpoint not configured. Set the RUNOPS_KEY environment variable.' });
    }
    if (!timingSafeEqual(req.headers['x-runops-key'] ?? '', RUNOPS_KEY)) {
      return json(res, 401, { error: 'Unauthorized' });
    }
    const users_total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const sumSince = (modifier) =>
      db.prepare(`SELECT COALESCE(SUM(hits), 0) AS c FROM traffic_daily WHERE day >= date('now', ?)`).get(modifier).c;
    const traffic = {
      daily: db.prepare(`SELECT COALESCE(SUM(hits), 0) AS c FROM traffic_daily WHERE day = date('now')`).get().c,
      weekly: sumSince('-6 days'),
      monthly: sumSince('-29 days'),
    };
    json(res, 200, { users_total, traffic });
  },

  'GET /api/week': async (req, res, user, url) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const weekStart = url.searchParams.get('start');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? '')) return json(res, 400, { error: 'Invalid week' });
    const weekly = db.prepare("SELECT id FROM tasks WHERE user_id = ? AND type = 'weekly' AND active = 1").all(user.id);
    const ins = db.prepare('INSERT OR IGNORE INTO instances (user_id, task_id, week_start) VALUES (?, ?, ?)');
    for (const t of weekly) ins.run(user.id, t.id, weekStart);
    const members = db.prepare('SELECT * FROM members WHERE user_id = ? ORDER BY id').all(user.id);
    const instances = db.prepare(`${INSTANCE_SELECT} WHERE i.user_id = ? AND i.week_start = ? ORDER BY i.id`).all(user.id, weekStart);
    json(res, 200, { members, instances, weekStart, familyName: user.family_name });
  },

  'POST /api/members': async (req, res, user) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const { name, role, color } = await readJson(req);
    if (!name?.trim()) return json(res, 400, { error: 'A name is required.' });
    const r = db.prepare('INSERT INTO members (user_id, name, role, color) VALUES (?, ?, ?, ?)')
      .run(user.id, name.trim(), role?.trim() || 'Member', color || '#FF6B6B');
    json(res, 200, { member: db.prepare('SELECT * FROM members WHERE id = ?').get(r.lastInsertRowid) });
  },

  'PATCH /api/members/:id': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const member = db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!member) return json(res, 404, { error: 'Not found' });
    const { name, role, color } = await readJson(req);
    db.prepare('UPDATE members SET name = ?, role = ?, color = ? WHERE id = ?').run(
      name?.trim() || member.name, role?.trim() || member.role, color || member.color, member.id);
    json(res, 200, { member: db.prepare('SELECT * FROM members WHERE id = ?').get(member.id) });
  },

  'DELETE /api/members/:id': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const member = db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!member) return json(res, 404, { error: 'Not found' });
    db.prepare('UPDATE instances SET member_id = NULL, day = NULL WHERE member_id = ?').run(member.id);
    db.prepare('DELETE FROM members WHERE id = ?').run(member.id);
    json(res, 200, { ok: true });
  },

  'POST /api/members/:id/image': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const member = db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!member) return json(res, 404, { error: 'Not found' });
    const ext = ALLOWED_UPLOADS[req.headers['content-type']?.split(';')[0].trim()];
    if (!ext) return json(res, 400, { error: 'Please upload a PNG, JPG, or WebP image.' });
    let body;
    try { body = await readBody(req, 8 * 1024 * 1024); } catch { return json(res, 400, { error: 'Image is too big (max 8 MB).' }); }
    if (!body.length) return json(res, 400, { error: 'No file uploaded.' });
    const name = `photo-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), body);
    db.prepare('UPDATE members SET photo = ?, image = ? WHERE id = ?').run(name, name, member.id);
    json(res, 200, { member: db.prepare('SELECT * FROM members WHERE id = ?').get(member.id) });
  },

  'POST /api/members/:id/generate': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const member = db.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!member) return json(res, 404, { error: 'Not found' });
    const { mode, description } = await readJson(req);
    if (mode === 'photo' && !member.photo) return json(res, 400, { error: 'Upload a photo first!' });
    try {
      const { filename, source } = await generateAvatar({ member, mode, description });
      db.prepare('UPDATE members SET image = ? WHERE id = ?').run(filename, member.id);
      json(res, 200, { member: db.prepare('SELECT * FROM members WHERE id = ?').get(member.id), source });
    } catch (err) {
      console.error(err);
      json(res, 502, { error: 'Image generation failed. Please try again.' });
    }
  },

  'POST /api/tasks': async (req, res, user) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const { title, emoji, type, weekStart } = await readJson(req);
    if (!title?.trim()) return json(res, 400, { error: 'The task needs a name.' });
    if (!['weekly', 'once'].includes(type)) return json(res, 400, { error: 'Invalid task type.' });
    const r = db.prepare('INSERT INTO tasks (user_id, title, emoji, type) VALUES (?, ?, ?, ?)')
      .run(user.id, title.trim(), emoji || '⭐', type);
    if (/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? '')) {
      db.prepare('INSERT INTO instances (user_id, task_id, week_start) VALUES (?, ?, ?)').run(user.id, r.lastInsertRowid, weekStart);
    }
    json(res, 200, { ok: true });
  },

  'PATCH /api/instances/:id': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!inst) return json(res, 404, { error: 'Not found' });
    const body = await readJson(req);
    let { member_id, is_family, day, completed } = { ...inst, ...body };
    if ('member_id' in body && body.member_id != null) is_family = 0;
    if ('is_family' in body && body.is_family) member_id = null;
    if (day != null && member_id == null && !is_family) return json(res, 400, { error: 'Assign this task to someone first!' });
    if (day != null && (day < 0 || day > 6)) return json(res, 400, { error: 'Invalid day' });
    db.prepare('UPDATE instances SET member_id = ?, is_family = ?, day = ?, completed = ? WHERE id = ?')
      .run(member_id, is_family ? 1 : 0, day, completed ? 1 : 0, inst.id);
    json(res, 200, { instance: db.prepare(`${INSTANCE_SELECT} WHERE i.id = ?`).get(inst.id) });
  },

  'DELETE /api/instances/:id': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!inst) return json(res, 404, { error: 'Not found' });
    db.prepare('DELETE FROM instances WHERE id = ?').run(inst.id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(inst.task_id);
    if (task?.type === 'once') db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    json(res, 200, { ok: true });
  },

  'DELETE /api/tasks/:id': async (req, res, user, url, m) => {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(m.id, user.id);
    if (!task) return json(res, 404, { error: 'Not found' });
    db.prepare('DELETE FROM instances WHERE task_id = ?').run(task.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    json(res, 200, { ok: true });
  },

  'GET /api/images/:name': async (req, res, user, url, m) => {
    const name = path.basename(decodeURIComponent(m.name));
    const file = path.join(UPLOADS_DIR, name);
    if (!MIME[path.extname(name).toLowerCase()] || !fs.existsSync(file)) {
      return json(res, 404, { error: 'Not found' });
    }
    sendFile(res, file, true);
  },
};

// ---------- routing ----------

const apiRoutes = Object.entries(api).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const re = new RegExp('^' + pattern.replace(/:[a-z]+/g, (s) => `(?<${s.slice(1)}>[^/]+)`) + '$');
  return { method, re, handler };
});

const PAGES = {
  '/': 'landing.html',
  '/signup': 'auth.html',
  '/login': 'auth.html',
  '/app': 'app.html',
};

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    for (const { method, re, handler } of apiRoutes) {
      if (req.method !== method) continue;
      const match = url.pathname.match(re);
      if (!match) continue;
      const user = userFromRequest(req);
      await handler(req, res, user, url, match.groups ?? {});
      return;
    }

    if (req.method === 'GET' && PAGES[url.pathname]) {
      if (url.pathname === '/app' && !userFromRequest(req)) {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
      recordPageView();
      return sendFile(res, path.join(PUBLIC, PAGES[url.pathname]));
    }

    if (req.method === 'GET') {
      const safe = path.normalize(url.pathname).replace(/^([.][.][/\\])+/, '');
      const file = path.join(PUBLIC, safe);
      if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return sendFile(res, file);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
  }
}
