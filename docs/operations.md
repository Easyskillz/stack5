# Operations

## Stack

Node.js 22 + Express, SQLite (`better-sqlite3`), plain HTML/JS frontend. On the server, it runs as the systemd service `stack5` (`deploy/stack5.service`) behind nginx (`deploy/nginx.conf`) on port 3000, at `/var/www/stack5/stack5-beta`.

## Running locally

```bash
npm install
cp .env.example .env   # then set NODE_ENV=development, PUBLIC_BASE_URL=http://localhost:3000
npm start
```

Signing in needs Steam. To test without real Steam accounts, run the fake Steam sign-in next to the app. It lets you sign in as any SteamID64:

```bash
node scripts/fake-steam.js                     # http://localhost:3999
STEAM_OPENID_ENDPOINT=http://localhost:3999/openid/login npm start
```

`STACK5_ELIGIBILITY=off` skips the Steam history checks (account age, hours, bans). Never set `STEAM_OPENID_ENDPOINT` in production.

## Configuration

Every setting is listed with a comment in `.env.example`. The server's real `.env` holds the secrets (SMTP password, Steam/FACEIT/Leetify keys) and is never committed.

## Email

- Hostinger Email, one mailbox: **contact@stack5cs.com** (read in Outlook). **no-reply@stack5cs.com** is an alias that delivers to it.
- The site logs in as contact@ (`SMTP_USER`) and sends everything (email verification, Contact-page messages) from `"STACK5 <contact@stack5cs.com>"`. Hostinger refuses to send from an alias ("553 Sender address rejected: not owned by user"), so `SMTP_FROM` must be the mailbox address.
- `SMTP_PASS` is wrapped in single quotes in the server `.env` because it contains `#`. When the mailbox password changes, update it there and restart `stack5`.

## Media files (not in git)

`public/media/` on the server holds uploaded files that are not part of the code, served at `https://stack5cs.com/media/...`. Deploys never touch them, and they are included in each deploy backup (`code.tar.gz`). Currently: `stack5-beta-invite.mp4` (beta invite video, source in `marketing/beta-video/`). To replace one, re-upload it with `scp` to the same path.

## Deploying

The process used so far:

1. **Check for drift:** confirm the server's files still match the last deployed commit (sha256), so edits made directly on the server are never overwritten.
2. **Back up** code and config, plus a consistent online snapshot of the SQLite database, to `/root/stack5-backup-<date-time>/`.
3. Unpack the changed files, restart `stack5`, and check `/api/health`.
4. **Copy the database backup off the server:** run `stack5-pull-backup.sh` on the operator's PC (it lives outside the repo). It downloads the new snapshot to `C:\Users\PC\stack5-db-backups\` and checks it with sha256.
5. **Push to GitHub** (`git push`) as a code backup.

## Backups

| Where | What | Kept for |
|---|---|---|
| VPS `/root/stack5-backup-*` | code, `.env`, database | 30 days (a daily cron job, `stack5-backup-prune`, deletes older ones) |
| Operator's PC `stack5-db-backups\` | database | 30 days (deleted by `stack5-pull-backup.sh`) |
| GitHub `Easyskillz/stack5` (private) | code and wiki, full history | forever (never contains `.env` or the database) |

The 30-day limit is what the Privacy Policy (section 8) promises, so don't keep database backups longer. GitHub is only a backup: deploys go straight from the PC to the server, and the server never pulls from GitHub.

Database changes are applied automatically at startup (`src/db.js`), and they only add things, so older data keeps working.

## Restoring a backup

Stop `stack5`, copy `stack5.db` from the backup folder to `data/stack5.db` (and/or unpack `code.tar.gz`), and start `stack5` again.

## Health check

`GET /api/health` returns `{ ok: true, service: "stack5", version: "0.2.0" }`.
