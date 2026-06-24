import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local dev only: load .env.local into process.env before the handler reads it.
// (Vercel injects env vars automatically, so this never runs there.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// Dynamic import so the env file above is applied before the handler module evaluates.
const { default: handler } = await import('./api/index.js');

const PORT = process.env.PORT || 3000;
http.createServer(handler).listen(PORT, () => {
  console.log(`🏠 Family Council running at http://localhost:${PORT}`);
});
