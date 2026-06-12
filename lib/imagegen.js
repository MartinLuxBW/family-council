import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOADS_DIR } from './db.js';
import { cartoonAvatarSvg } from './cartoon.js';

const STYLE_PROMPT =
  'A friendly, wholesome cartoon avatar portrait for a family weekly planner app. ' +
  "Style: colorful children's book illustration, soft rounded shapes, warm palette, big friendly smile. " +
  'Strictly family-friendly and G-rated. Head and shoulders only, simple pastel background.';

function saveBuffer(buffer, ext) {
  const name = `avatar-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return name;
}

async function openaiGenerate(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024' }),
  });
  if (!res.ok) throw new Error(`OpenAI image generation failed: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Buffer.from(data.data[0].b64_json, 'base64');
}

async function openaiCartoonify(photoPath, description) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append(
    'prompt',
    `Redraw this person as a cartoon character. ${STYLE_PROMPT} ${description ? `Extra details: ${description}` : ''}`
  );
  const bytes = fs.readFileSync(photoPath);
  const ext = path.extname(photoPath).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  form.append('image', new Blob([bytes], { type: mime }), `photo.${ext}`);
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI image edit failed: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Buffer.from(data.data[0].b64_json, 'base64');
}

/**
 * Generate a cartoon avatar. mode: 'description' | 'photo'.
 * Returns { filename, source } where source is 'openai' or 'builtin'.
 */
export async function generateAvatar({ member, mode, description }) {
  if (process.env.OPENAI_API_KEY) {
    let buffer;
    if (mode === 'photo' && member.photo) {
      buffer = await openaiCartoonify(path.join(UPLOADS_DIR, member.photo), description);
    } else {
      const subject = description?.trim() || `a person named ${member.name}, role: ${member.role}`;
      buffer = await openaiGenerate(`${STYLE_PROMPT} Subject: ${subject}.`);
    }
    return { filename: saveBuffer(buffer, 'png'), source: 'openai' };
  }

  // Fallback: deterministic built-in cartoon, seeded by the description/name.
  const seed = `${description?.trim() || ''} ${member.name} ${member.id}`;
  const svg = cartoonAvatarSvg(seed);
  return { filename: saveBuffer(Buffer.from(svg), 'svg'), source: 'builtin' };
}
