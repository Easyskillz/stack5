# External data sources

All three sources are free. Each has its own rules, and CleanLobby is built around them.

| Source | Used for | Stored? | In Trust Score? |
|---|---|---|---|
| **Steam Web API** | Account age, CS2 hours, Steam level, VAC/game/community bans, privacy status | Yes, refreshed every 7 days | Yes |
| **Steam sign-in (OpenID)** | Proving a player owns their Steam account | Only the Steam ID | — |
| **Leetify** | Live "CS2 stats" panel on profiles; **Premier rating copied to the profile** for matchmaking | Panel: no (5-minute memory cache). Premier rating: **yes** (refreshed daily) | No |
| **FACEIT** | Live FACEIT panel on profiles: level, Elo, matches, bans | No (5-minute memory cache) | No |

## Rules we follow

- **Leetify:** their [developer guidelines](https://leetify.com/blog/leetify-api-developer-guidelines/) ask developers not to store their data, not to rescale or recalculate it, and to show "Data Provided by Leetify". Everything is shown unmodified with that attribution and a link back.
  - **Known exception (operator's decision, 2026-10-05):** the CS2 Premier rating is copied into `players.premier_rating` (`premier_source='leetify'`) when a player leaves it empty, and used for matchmaking. This goes against the "don't store" request; the risk (losing API access) was accepted. To stay as close as possible: the number is never changed, it's labelled "Data Provided by Leetify", refreshed daily, deleted when Leetify no longer has it, and a rating the player types (`'self'`) always wins. Code: `syncPremierFromLeetify()` in `src/external.js`, run at sign-up and by the trust upkeep job. Safer alternative if Leetify objects: switch to live-only use (fetch at matchmaking time, never store), or ask them for written permission.
- **FACEIT** (API terms):
  - **Section 5.4:** no permanent copies and no derivative works. So nothing from FACEIT is saved and it is not used in the Trust Score. Any FACEIT data an older version stored is wiped automatically when the server starts.
  - **Section 4.2:** keep the API key confidential. It lives only in the server's `.env` file, never in the code or git.
  - **Section 6.3:** never suggest FACEIT endorses or partners with CleanLobby.
  - **Section 3.4:** have a privacy policy (done, see [Legal pages](legal.md)).
- **Steam:** CleanLobby never asks for a Steam password.

If FACEIT confirms in writing that we may use their data in the score, that can be revisited.

## Settings (`.env`)

- `STEAM_API_KEY`: from steamcommunity.com/dev/apikey. Without it, nothing from Steam is checked and nobody becomes eligible.
- `FACEIT_API_KEY`: server-side key from developers.faceit.com. Without it, the FACEIT panel is hidden.
- `LEETIFY_API_KEY`: optional; raises Leetify's rate limits.

## Technical notes

- Code: `src/external.js` (`fetchSteam`, `refreshExternal`, `leetifyProfile`, `faceitProfile`).
- Steam data is stored in `player_external`. Its FACEIT columns exist from an older version but stay empty.
