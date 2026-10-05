# Steam verification ("Sign in through Steam")

**Status:** live since 2026-10-05 (commit `043bea2`).

## Why it exists

Previously a player typed in a Steam profile link, and nothing checked that it was theirs. Anyone could paste a famous player's link, inherit that account's age and hours, and pass the [eligibility check](eligibility.md). Steam sign-in closes that hole: only the person who can log in to a Steam account can link it.

## How it works for players

1. After verifying their email, a new player sees **Step 1 of 2: Link your Steam account** on the Play page.
2. They click **Sign in through Steam** and log in on Steam's own website (steamcommunity.com).
3. Steam sends them back to STACK5 with their Steam ID. They see "Steam account verified ✓".
4. **Step 2 of 2** is the normal [profile setup](player-profile.md), with the Steam account already filled in.

STACK5 never sees the Steam password; Steam only tells us the account's Steam ID.

**Existing players** (who joined before this feature) have a new item at the top of their eligibility checklist: "Steam account verified as yours". Until they click **Verify with Steam**, they can browse but can't create, join or queue a team.

Profiles show a **STEAM VERIFIED** or **Steam not verified** badge.

## Rules

- **A verified owner beats an unverified claim.** If someone had pasted a Steam account that isn't theirs, the real owner can still verify it. The impostor's profile loses the Steam link (and with it, eligibility).
- **One verified owner per Steam account.** If another STACK5 player has already verified a Steam account, nobody else can take it. Contact support if that ever looks wrong.
- Each sign-in link works once, for 15 minutes, and only for the account that started it.

## Technical notes

- Code: `src/steam-auth.js` (OpenID 2.0), routes `/auth/steam/start` and `/auth/steam/return` plus `linkVerifiedSteam()` in `src/server.js`, UI in `public/app.js` (`steamButton`, profile setup).
- Security: Steam's answer is confirmed directly with Steam (`check_authentication`) before the Steam ID is trusted. A random one-time `state` tied to the logged-in account blocks replayed or stolen links. The return URL and provider endpoint are checked exactly.
- Database: `accounts.verified_steam_id`, `players.steam_verified`, `players.steam_verified_at`, table `steam_auth_states`.
- Settings: `STEAM_VERIFICATION=off` disables it (local development only). `STEAM_OPENID_ENDPOINT` overrides Steam's endpoint (tests only). `PUBLIC_BASE_URL` must be the real site address, because Steam returns players there.
- An admin eligibility override also bypasses the Steam-ownership check (see [Admin](admin.md)).
