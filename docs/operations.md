# Operations

## Stack

Node.js 22 + Express, SQLite (`better-sqlite3`), plain HTML/JS frontend. On the server, it runs as the systemd service `stack5` (`deploy/stack5.service`) behind nginx (`deploy/nginx.conf`) on port 3000, at `/var/www/stack5/stack5-beta`.

## Running locally

```bash
npm install
cp .env.example .env   # then set NODE_ENV=development, PUBLIC_BASE_URL=http://localhost:3000
npm start
```

For local testing, `STACK5_ELIGIBILITY=off` and `STEAM_VERIFICATION=off` skip the Steam checks.

## Configuration

Every setting is listed with a comment in `.env.example`. The server's real `.env` holds the secrets (SMTP password, Steam/FACEIT/Leetify keys) and is never committed.

## Deploying

The process used so far:

1. **Check for drift:** confirm the server's files still match the last deployed commit (sha256), so edits made directly on the server are never overwritten.
2. **Back up** code and config, plus a consistent online snapshot of the SQLite database, to `/root/stack5-backup-<date-time>/`.
3. Unpack the changed files, restart `stack5`, and check `/api/health`.

Database changes are applied automatically at startup (`src/db.js`), and they only add things, so older data keeps working.

## Restoring a backup

Stop `stack5`, copy `stack5.db` from the backup folder to `data/stack5.db` (and/or unpack `code.tar.gz`), and start `stack5` again.

## Health check

`GET /api/health` returns `{ ok: true, service: "stack5", version: "0.2.0" }`.
