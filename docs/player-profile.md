# Player profile

The profile is what other players and captains see when they look for teammates.

## Setup

Players create it on the Play page after verifying their email (and, once deployed, after [signing in through Steam](steam-verification.md)). They fill in:

- **Display name** (up to 40 characters; defaults to the username)
- **Country**, only from the **beta countries** (Morocco, France, Belgium, Switzerland, Luxembourg, Monaco, Spain, Andorra, Portugal, United Kingdom, Ireland, Malta: `BETA_COUNTRIES` in `src/regions.js`). It decides which teams you can be matched against (only ones close enough for good ping, see [matchmaking](queue-and-matchmaking.md))
- **Languages you speak** (one or more). Teammates need a language in common, so Find Players filters by language, teams show the languages all their members share, and join requests say whether the player speaks the team's language. Editable any time on the Play page (`POST /api/profile/languages`).
- **CS2 Premier rating:** players can't type or change it. It's copied from their Leetify profile at sign-up and refreshed daily (shown with "Data Provided by Leetify"; see [data sources](data-sources.md) for the rule this bends). No Leetify profile = "Unrated", with a "Check Leetify again" button on the Play page (`POST /api/profile/premier` only re-reads Leetify). Ratings players typed before 2026-10-05 were deleted. The Play page's "Your profile" box also shows the live FACEIT level and Elo (not stored, FACEIT's API terms). Players can update it at any time from the "Your profile" box on the Play page (`POST /api/profile/premier`), because it changes every week. Accounts without one see a reminder there.
- **Role**: Rifler, AWPer, Entry, IGL, Support or Lurker
- **Language**: English, French, Arabic, Spanish, German, Portuguese, Italian, Dutch, Turkish or Russian

The Steam account is the one they signed in with. It's shown as verified and can't be changed here.

A Steam account can belong to only one CleanLobby profile, and each account has one profile.

## Premier rating badge

Ratings are shown like in CS2: a slanted badge, digits after the comma smaller, coloured by tier. Grey under 5,000, light blue 5,000+, blue 10,000+, purple 15,000+, pink 20,000+, red 25,000+, gold 30,000+. "Unrated" when there is none. Find Players can filter by tier. Code: `premier()` in `public/app.js`, `.premier` in `public/app.css`.

## Beta countries

The beta is open to 12 countries (above). Players in other countries (older profiles) see "Your country is open in the beta" failing in their eligibility checklist and can't create, join or queue a team. Regions are no longer shown anywhere: matchmaking uses the distance between countries, and filters use the country. Languages: English, French, Spanish, Portuguese.

## Public profile page (`/player/<name>`)

- Name, country, region, role, languages spoken, CS2 Premier rating (marked "self-reported")
- **STEAM VERIFIED** and **MEETS REQUIREMENTS** badges
- The [Trust Score](trust-score.md) with its breakdown
- **CS2 stats from Leetify** (live): Leetify rating, Premier, aim, positioning, utility, matches
- **FACEIT panel** (live; shown only when `FACEIT_API_KEY` is set on the server): level, Elo, matches, member since, bans with an active-ban warning, link to the FACEIT profile. Shows "No FACEIT account linked" if there is none.
- A link to the Steam profile

## Technical notes

- Code: `POST /api/profile`, `GET /api/players/:id`, `/api/players/:id/leetify`, `/api/players/:id/faceit` in `src/server.js`; profile page and setup form in `public/app.js`; regions in `src/regions.js`.
- After a profile is created, Steam data is fetched in the background and the Trust Score and eligibility are recalculated.
- The Leetify and FACEIT panels are fetched live and never stored; see [External data sources](data-sources.md).
