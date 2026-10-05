# Player eligibility

New and throwaway Steam accounts are the main way cheaters come back, so STACK5 only lets players with real, verifiable history play.

## Requirements

To **create, join or queue a team**, a player must pass every check:

| Check | Requirement |
|---|---|
| Steam account verified as yours | Signed in through Steam (see [Steam verification](steam-verification.md); not deployed yet) |
| Steam profile found | STACK5 could load the Steam profile |
| Steam profile is public | Steam privacy: "My profile" set to Public |
| Account age | Steam account at least **2 years** old |
| CS2 hours | At least **500 hours** of CS2 (Steam privacy: "Game details" set to Public) |
| Clean record | No VAC or game ban in the last 2 years, and no Steam community ban |

Players who don't pass can still log in, browse, and view players and teams.

## How it works for players

- The Play page shows a checklist with ✅/❌ for each check, why it failed, and how to fix it (for example, a link to Steam's privacy settings).
- After fixing something on Steam, they click **Check again**. Steam can take a few minutes to update.
- Player cards show **MEETS REQUIREMENTS** when a player passes.

## Where it is enforced

- Creating a team, accepting an invite, requesting to join, and queueing all require it.
- A captain can't invite a player who isn't eligible, and accepting a join request re-checks the player.
- When a team queues, all five members are re-checked.

## Exceptions

An admin can approve a player manually (for example a known pro with a private profile) or block one. See [Admin](admin.md).

## Technical notes

- Code: `src/eligibility.js` (`evaluateEligibility`, `isEligible`); the `eligibleRequired` middleware in `src/server.js`; the checklist UI is `eligibilityPanel` in `public/app.js`.
- The result is stored on the player (`eligible`, `eligibility` JSON, `eligibility_checked_at`) and refreshed after Steam data refreshes (see [External data sources](data-sources.md)).
- Settings: `STACK5_ELIGIBILITY=off` (development only), `ELIGIBILITY_MIN_STEAM_DAYS` (default 730), `ELIGIBILITY_MIN_CS2_HOURS` (default 500).
- Admin override: `players.eligibility_override` (1 = always allowed, 0 = always blocked, empty = automatic).
