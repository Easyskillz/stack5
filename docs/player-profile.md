# Player profile

The profile is what other players and captains see when they look for teammates.

## Setup

Players create it on the Play page after verifying their email (and, once deployed, after [signing in through Steam](steam-verification.md)). They fill in:

- **Display name** (up to 40 characters; defaults to the username)
- **Country**, which sets the **matchmaking region** automatically
- **FACEIT level** (self-reported, 1–10) and optionally Elo
- **Role**: Rifler, AWPer, Entry, IGL, Support or Lurker
- **Language**: English, French, Arabic, Spanish, German, Portuguese, Italian, Dutch, Turkish or Russian

The Steam account is the one they signed in with. It's shown as verified and can't be changed here.

A Steam account can belong to only one CleanLobby profile, and each account has one profile.

## Regions

Europe, North America, South America, Latin America, Asia, Southeast Asia, Oceania, Middle East, **North Africa** (`NAFR`, a dedicated region) and Africa. Each country maps to one region, and teams only play teams from the same region.

## Public profile page (`/player/<name>`)

- Name, country, region, role, language, FACEIT level (marked "self-reported")
- **STEAM VERIFIED** and **MEETS REQUIREMENTS** badges
- The [Trust Score](trust-score.md) with its breakdown
- **CS2 stats from Leetify** (live): Leetify rating, Premier, aim, positioning, utility, matches
- **FACEIT panel** (live; shown only when `FACEIT_API_KEY` is set on the server): level, Elo, matches, member since, bans with an active-ban warning, link to the FACEIT profile. Shows "No FACEIT account linked" if there is none.
- A link to the Steam profile

## Technical notes

- Code: `POST /api/profile`, `GET /api/players/:id`, `/api/players/:id/leetify`, `/api/players/:id/faceit` in `src/server.js`; profile page and setup form in `public/app.js`; regions in `src/regions.js`.
- After a profile is created, Steam data is fetched in the background and the Trust Score and eligibility are recalculated.
- The Leetify and FACEIT panels are fetched live and never stored; see [External data sources](data-sources.md).
