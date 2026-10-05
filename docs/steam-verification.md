# Steam verification ("Sign in through Steam")

**Status:** live since 2026-10-05 (commit `043bea2`). Since the same day it's also the **only way to sign in** (see [Accounts & login](accounts-and-login.md)).

## Why it exists

Previously a player typed in a Steam profile link, and nothing checked that it was theirs. Anyone could paste a famous player's link, inherit that account's age and hours, and pass the [eligibility check](eligibility.md). With Steam sign-in, only the person who can log in to a Steam account can use it, so every CleanLobby account is a proven Steam account. Pasting a link is no longer possible anywhere.

## How it works for players

1. They click **Sign in with Steam** and log in on Steam's own website (steamcommunity.com), with their password or the Steam app's QR code.
2. Steam sends them back to CleanLobby with their Steam ID.
3. First time: they pick a username. Then the normal [profile setup](player-profile.md), with the Steam account already filled in.

CleanLobby never sees the Steam password, and it has no access to inventory or trades. Steam only tells us the account's Steam ID.

Profiles show a **STEAM VERIFIED** or **Steam not verified** badge. Only old test accounts can still be unverified.

## Is it safe? (what we tell players)

Fake "Sign in through Steam" pages are the most common way CS players lose skins, so the `/login` page explains how to recognise the real one:

- The address bar must say `https://steamcommunity.com` before typing a password or scanning a QR code.
- CleanLobby never asks for a Steam Guard code, an API key or a trade link.
- When approving in the Steam app, Steam shows where the request comes from. If it isn't where you are, deny it.

CleanLobby always uses a full-page redirect, never a popup, so the real address is always visible. QR-only sign-in isn't possible: Steam decides what its page shows, and QR codes can be phished too.

## Rules

- **A verified owner beats an unverified claim.** If an old profile had pasted a Steam account, the real owner signing in gets that account. If the owner already had another account, the pasted link is removed from the impostor's profile.
- **One CleanLobby account per Steam account.** A Steam account already used by another CleanLobby account can't be linked again. Contact support if that ever looks wrong.
- Each sign-in attempt works once, for 15 minutes, and only in the browser that started it.

## Technical notes

- Code: `src/steam-auth.js` (OpenID 2.0), routes `/auth/steam/start` and `/auth/steam/return` plus `linkVerifiedSteam()` in `src/server.js`, UI in `public/pages/login.html`, `welcome.html` and `public/app.js` (`steamButton`).
- Security: Steam's answer is confirmed directly with Steam (`check_authentication`) before the Steam ID is trusted. A random one-time `state`, stored in the database and in a `stack5_steam_state` cookie, blocks replayed or stolen links and stops anyone from signing someone else in with a link. The return URL and provider endpoint are checked exactly.
- Database: `accounts.verified_steam_id` (unique), `players.steam_verified`, `players.steam_verified_at`, tables `steam_auth_states` and `steam_signups`.
- Settings: `PUBLIC_BASE_URL` must be the real site address, because Steam returns players there. `STEAM_OPENID_ENDPOINT` points sign-in at the fake Steam for local testing (see [Operations](operations.md)). Never set it in production.
- An admin eligibility override also bypasses the Steam-ownership check (see [Admin](admin.md)).
