# STACK5 Wiki

How every part of STACK5 works: what players see, the rules behind it, and where it lives in the code.

**Keep it current:** any change to a feature updates its page in the same commit, and adds a line to the [changelog](#changelog) below.

## Features

| Page | What it covers | Status |
|---|---|---|
| [Accounts & login](accounts-and-login.md) | Sign-up, email verification, login, password reset, sessions | Live |
| [Steam verification](steam-verification.md) | "Sign in through Steam": proving a Steam account is yours | Ready, not deployed yet |
| [Player eligibility](eligibility.md) | Who is allowed to play (account age, hours, bans) | Live |
| [Player profile](player-profile.md) | Profile setup, regions, public profile page, Leetify and FACEIT panels | Live (FACEIT panel not deployed yet) |
| [Trust Score](trust-score.md) | The 0–100 reputation score and how it is calculated | Live |
| [Teams](teams.md) | Creating teams, invites, join requests, captain actions | Live |
| [Queue & matchmaking](queue-and-matchmaking.md) | Queueing a full team, how opponents are picked, accepting matches | Live |
| [Timers](timers.md) | Time limits for open teams, the queue and match acceptance | Live |
| [Account deletion](account-deletion.md) | Self-service deletion and what happens to the data | Live |
| [Legal pages](legal.md) | Terms of Service and Privacy Policy | Live |
| [Admin](admin.md) | Admin dashboard and manual overrides | Live |
| [External data sources](data-sources.md) | Steam, FACEIT and Leetify, and the rules each one imposes | Live |
| [Operations](operations.md) | Configuration, deploying, backups | — |

## Known gaps

- The Matches and Rankings pages are placeholders.
- There is no way to report a match result yet.
- The FACEIT level used in matchmaking is self-reported (the live FACEIT panel only displays the real one).

## Changelog

- **2026-10-05:** "Sign in through Steam" (ownership proof) and the live FACEIT profile panel; FACEIT removed from the Trust Score per FACEIT's API terms (`043bea2`). Wiki created; Terms and Privacy updated for both features. Not deployed yet.
- **2026-10-05:** Eligibility gate, timers, account deletion, Terms and Privacy pages (`534044c`).
- **2026-10-04:** Play hub, join requests, automatic matchmaking (`975532d`); invite-only teams, transfer/disband, trust only after a confirmed match (`d92ef0a`).
