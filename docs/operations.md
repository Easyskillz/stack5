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

- Hostinger Email: the site uses the **contact@cleanlobby.com** mailbox (since 5 Oct 2026). The old **contact@stack5cs.com** mailbox still exists and receives mail sent to the old address.
- The site logs in as contact@ (`SMTP_USER`) and sends everything (email verification, Contact-page messages) from `"CleanLobby <contact@cleanlobby.com>"`. Hostinger refuses to send from an alias ("553 Sender address rejected: not owned by user"), so `SMTP_FROM` must be the mailbox address.
- `SMTP_PASS` is wrapped in single quotes in the server `.env` because it contains `#`. When the mailbox password changes, update it there and restart `stack5`.

## Domain switch to cleanlobby.com

**Done 5 Oct 2026, 08:09 UTC** (backups: `/root/nginx-backup-2026-10-05-080912`, `/root/env.backup-2026-10-05-080912`, `/root/stack5-backup-2026-10-05-080925`). Kept here as a record and for any future domain change. The nginx config on the server: `sites-available/cleanlobby` serves the site (certificate from certbot); `sites-available/stack5` only redirects, and keeps its own certificate so old `https://` links still work. Steps, in order:

1. Buy **cleanlobby.com** and point its DNS (`@` and `www` A records) to the VPS.
2. In nginx, serve cleanlobby.com and redirect stack5cs.com with a **301** to the same path (template: `deploy/nginx.conf`). Get the certificate for both names: `certbot --nginx -d cleanlobby.com -d www.cleanlobby.com` (the stack5cs.com certificate must stay valid for the redirect to work over HTTPS).
3. Create the **contact@cleanlobby.com** mailbox (plus the no-reply@ alias) in Hostinger. In the server `.env`, set `PUBLIC_BASE_URL=https://cleanlobby.com`, `SMTP_USER` and `SMTP_PASS` for the new mailbox, `SMTP_FROM="CleanLobby <contact@cleanlobby.com>"` and `CONTACT_EMAIL=contact@cleanlobby.com`. Keep the old mailbox for a while to catch mail sent to the old address.
4. Merge `rename-cleanlobby` into `main` and deploy as usual (the deploy ships the new og.png, icons and guide screenshots).
5. Test: sign in through Steam on cleanlobby.com (Steam's page should name cleanlobby.com), send a Contact-page message, check that `https://stack5cs.com/guide` redirects to `https://cleanlobby.com/guide` and that link previews show the new image.
6. In Google Search Console, add cleanlobby.com and use **Change of address** from stack5cs.com; submit the new sitemap. Re-render and upload the beta video.

## Media files (not in git)

`public/media/` on the server holds uploaded files that are not part of the code, served at `https://cleanlobby.com/media/...`. Deploys never touch them, and they are included in each deploy backup (`code.tar.gz`). Currently: `stack5-beta-invite.mp4` (beta invite video, source in `marketing/beta-video/`). To replace one, re-upload it with `scp` to the same path.

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
