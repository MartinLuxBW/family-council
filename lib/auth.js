import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, DATA_DIR } from './db.js';

const COOKIE = 'fc_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Prefer SESSION_SECRET env var (set this in Vercel dashboard for persistent sessions).
// Falls back to a file so local dev and single-instance deploys work automatically.
function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  }
  return fs.readFileSync(file, 'utf8').trim();
}

const SECRET = getSecret();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function sessionCookie(userId) {
  const token = sign({ uid: userId, exp: Date.now() + MAX_AGE * 1000 });
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`;
}

export async function userFromRequest(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((c) => {
      const i = c.indexOf('=');
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
  const payload = verify(cookies[COOKIE]);
  if (!payload) return null;
  return (await get('SELECT id, email, family_name FROM users WHERE id = ?', [payload.uid])) ?? null;
}
