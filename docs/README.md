# CleanLobby Wiki

How every part of CleanLobby works: what players see, the rules behind it, and where it lives in the code.

**Keep it current:** any change to a feature updates its page in the same commit, and adds a line to the [changelog](#changelog) below.

## Features

| Page | What it covers | Status |
|---|---|---|
| [Accounts & login](accounts-and-login.md) | Steam-only sign-in, first-time username, optional email, sessions | Live |
| [Steam verification](steam-verification.md) | "Sign in through Steam": how it works and why it's safe | Live |
| [Player eligibility](eligibility.md) | Who is allowed to play (account age, hours, bans) | Live |
| [Player profile](player-profile.md) | Profile setup, regions, public profile page, Leetify and FACEIT panels | Live (FACEIT panel needs `FACEIT_API_KEY` on the server) |
| [Trust Score](trust-score.md) | The 0–100 reputation score and how it is calculated | Live |
| [Teams](teams.md) | Creating teams, invites, join requests, captain actions | Live |
| [Player guide](../public/img/guide) | Public "How it works" page at `/guide`: 10 steps with screenshots + FAQ. Screenshots: `node scripts/guide-screenshots.mjs` | Live |
| [Match room](match-room.md) | Playing the match through CS2 Private Matchmaking, reporting the score, disputes, ratings | Live |
| [Queue & matchmaking](queue-and-matchmaking.md) | Queueing a full team, how opponents are picked, accepting matches | Live |
| [Timers](timers.md) | Time limits for open teams, the queue and match acceptance | Live |
| [Account deletion](account-deletion.md) | Self-service deletion and what happens to the data | Live |
| [Legal pages](legal.md) | Terms of Service and Privacy Policy | Live |
| [Admin](admin.md) | Admin dashboard and manual overrides | Live |
| [External data sources](data-sources.md) | Steam, FACEIT and Leetify, and the rules each one imposes | Live |
| [SEO & discoverability](seo.md) | Page titles and descriptions, sitemap, robots.txt, llms.txt, link previews | Live |
| [Operations](operations.md) | Configuration, deploying, backups | — |

## Marketing

- **Beta invite video:** https://stack5cs.com/media/stack5-beta-invite.mp4, source in `marketing/beta-video/` (31 s vertical MP4 made from the site's look and the guide screenshots; see its README to change the text and re-render). Not deployed. The hosted file still shows the STACK5 name; the source already says CleanLobby, so re-render and upload it as `cleanlobby-beta-invite.mp4` at the domain switch.

## Known gaps

- The Rankings page is a placeholder.
- The FACEIT level used in matchmaking is self-reported (the live FACEIT panel only displays the real one).

## Changelog

- **2026-10-05 (branch `rename-cleanlobby`, not live yet):** STACK5 renamed **CleanLobby**, new domain cleanlobby.com (stack5cs.com will redirect to it). All visible text, the wiki, the guide screenshots, the link-preview image and the icons (now "CL") use the new name; the images regenerate with `scripts/brand-images.mjs`. Terms and Privacy say "formerly STACK5". Internal names (the `stack5_session` cookie, `STACK5_ELIGIBILITY`, the `stack5` service, server paths) are unchanged so nobody is logged out. Goes live with the [domain switch](operations.md#domain-switch-to-cleanlobbycom).
- **2026-10-05:** Beta invite video (`marketing/beta-video/`).
- **2026-10-05:** Player guide (`/guide`, "How it works" in the menu and footer) with 10 screenshots and an FAQ; screenshots regenerate with `scripts/guide-screenshots.mjs`. Optional team Discord voice link in the match room, visible only to that team. Website email now sent from the contact@ mailbox.
- **2026-10-05:** Contact page (`/contact`) with the email address and a form that emails contact@cleanlobby.com; Contact link in every footer; Privacy Policy covers the form.
- **2026-10-05:** Match room: CS2 Private Matchmaking code shared with the 10 players, both captains report the score (disputes go to the admin, 6-hour timeout), ratings and "matches played" only count completed matches, players locked until the match ends. Matches page (live + recent results) and live counters (players online, teams looking for a match). Country and language flags (self-hosted SVGs) next to players and teams. French removed (English only). SEO: per-page titles and descriptions, Open Graph image, structured data, sitemap.xml, robots.txt, llms.txt, crawler-readable page text, real 404s. Mobile layout fixes.
- **2026-10-05:** "Sign in through Steam" is now the only way to sign in. Passwords, sign-up, password reset and Steam-URL pasting removed (stored passwords deleted). First sign-in picks a username; email is optional and can be managed on the Account page. "Is this safe?" box on the sign-in page. Trust Score only uses verified Steam data. Fake Steam sign-in for local testing (`scripts/fake-steam.js`).
- **2026-10-05:** Terms · Privacy footer added to the login, forgot-password and sign-up pages. Code backed up to a private GitHub repo; each deploy also copies the database backup to the operator's PC.

- **2026-10-05:** "Sign in through Steam" (ownership proof) and the live FACEIT profile panel; FACEIT removed from the Trust Score per FACEIT's API terms (`043bea2`). Wiki created; Terms and Privacy updated for both features. Deployed 2026-10-05.
- **2026-10-05:** Eligibility gate, timers, account deletion, Terms and Privacy pages (`534044c`).
- **2026-10-04:** Play hub, join requests, automatic matchmaking (`975532d`); invite-only teams, transfer/disband, trust only after a confirmed match (`d92ef0a`).
