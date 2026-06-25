# 🏠 Family Council

A warm, colorful weekly family planner built as a SaaS-style web app. Hold your family council once a
week, pile up the tasks, and drag each one onto the right person and the right weekday.

## Features

- **Accounts** — families sign up with email + password (sessions via signed httpOnly cookies).
- **Family members** — add mom, dad, kids… each with a name, role, color, and avatar.
- **Avatars** — upload a photo, or generate a cartoon avatar:
  - With an `OPENAI_API_KEY` environment variable: real AI generation (`gpt-image-1`) from a text
    description, or "Cartoonify" an uploaded photo. Prompts are forced to a wholesome,
    family-friendly children's-book style.
  - Without a key: a built-in deterministic cartoon generator (seeded SVG faces) is used, so the
    feature always works — even fully offline.
- **The task pile** — add **weekly** tasks (they automatically reappear on the pile every week) or
  **one-time** tasks.
- **Drag & drop planning** — drag a task from the pile onto a family member's picture (or the
  "Everyone" card for whole-family tasks), then drag it onto a weekday column. Drag it back to the
  pile to unschedule; click the assignee's avatar on a card to unassign.
- **Week navigation** — flip between weeks; each week has its own plan. Check tasks off as done. ✓

## Run it

No dependencies to install — the app uses only what ships with Node.js 24 (including the built-in
`node:sqlite` database).

```powershell
$env:Path = "C:\Users\martinsch\tools\node;$env:Path"   # portable Node.js (installed for this project)
cd C:\Users\martinsch\dev\family-council
node server.js
```

Open http://localhost:3000. Data is stored in a local SQLite database under `data/` (created
automatically).

## AI avatars (optional)

```powershell
$env:OPENAI_API_KEY = "sk-..."
node server.js
```

## Persistent database (Turso)

The data layer ([lib/db.js](lib/db.js)) auto-selects a backend:

| Environment | Backend | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` set | **Turso** (`@libsql/client`) | Durable; the production path on Vercel |
| Node 24 local dev | `node:sqlite` | Built-in, file under `data/` |
| Fallback | `better-sqlite3` | If `node:sqlite` is unavailable |

Because Turso *is* SQLite, the schema and every query are identical across all three.

To use Turso in production:

1. Create a free database at <https://turso.tech>.
2. Grab the URL and a token: `turso db show <name> --url` and `turso db tokens create <name>`.
3. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in your Vercel project's environment variables.

## Tech

- **Server** — `node:http` handler ([api/index.js](api/index.js)) run by [server.js](server.js)
  locally and as a Vercel serverless function in prod. Signed-cookie sessions (`node:crypto` scrypt
  + HMAC), raw-body image uploads.
- **Database** — async `get`/`all`/`run` over Turso/libSQL or local SQLite (see above).
- **Frontend** — vanilla JS SPA ([public/app.js](public/app.js)) with native HTML5 drag & drop.
- **Theme** — hand-rolled warm/fun CSS (Baloo 2 + Nunito, cream/coral/teal/sunshine palette) in
  [public/styles.css](public/styles.css).
