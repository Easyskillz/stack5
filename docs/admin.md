# Admin

Admins have a dashboard at `/admin` (`admin.html`).

## What admins can do

- See site statistics, all accounts, players, teams, the queue and matches.
- **Run matchmaking** immediately instead of waiting for the next automatic run.
- **Override eligibility** for a player: always allow (for example a pro with a private profile) or always block. This also bypasses the [Steam ownership check](steam-verification.md), so only use it for players whose identity is known.
- **Recompute all Trust Scores.**

## Making someone an admin

There's no button for this. Set `is_admin = 1` on their row in the `accounts` table of the server database.

## Technical notes

- Routes: `/api/admin/*` and `/api/matchmaking/run` in `src/server.js`, all behind the `adminRequired` middleware.
- Eligibility override: `POST /api/admin/players/:id/eligibility` sets `players.eligibility_override`.
