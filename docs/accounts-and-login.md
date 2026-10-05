# Accounts & login

Every player needs a CleanLobby account before doing anything beyond browsing. **"Sign in through Steam" is the only way in.** There are no CleanLobby passwords (since 2026-10-05).

## How it works for players

1. Click **Sign in with Steam** (`/login`, also in the header). The player signs in on Steam's own website. See [Steam verification](steam-verification.md) for how that works and why it's safe.
2. **First time:** they land on `/welcome` and pick a username. Email is optional. They tick the box confirming they're 16 or older and accept the Terms and Privacy Policy. Their Steam display name is suggested as the username when it's available.
3. **Returning:** they go straight to the Play page.
4. A login lasts 30 days. **Logout** is in the header.

The `/login` page has an **"Is this safe?"** box: check the address bar says steamcommunity.com, CleanLobby only gets the public SteamID, it can't touch inventory or trades, and it never asks for a Steam Guard code, API key or trade link.

## Email (optional)

- Players can add, change or remove an email on the **Account** page (`/account`). A new email gets a verification link valid for 24 hours.
- It's used only for match notifications and important account news. It's never public and is never needed to sign in.

## Rules

- Username: 3–24 characters, letters, numbers or underscore. Unique, ignoring case.
- Email: unique, ignoring case.
- One CleanLobby account per Steam account.
- A first sign-in that never picks a username expires after 30 minutes.
- Each IP address can make at most 40 requests per minute to the same `/api` or `/auth` endpoint.

## Accounts from before Steam sign-in

Accounts created with a password before 2026-10-05 (the test dummies and `easyskillz`):

- If someone signs in through Steam with the Steam account an old profile had pasted, that account becomes theirs. Signing in proves they own it, and any other logins on that account are signed out.
- A browser that was still logged in from before can link a Steam account from the Play page.
- Their passwords were deleted by the migration. They can no longer log in any other way.

## Next step

After the first sign-in, the player [sets up their profile](player-profile.md).

## Technical notes

- Code: `src/server.js` (`/auth/steam/*`, `/welcome`, `/api/auth/signup`, `/api/account/email`, `/verify-email`), pages `public/pages/login.html` and `welcome.html`.
- The session is an HTTP-only `SameSite=Lax` cookie (`Secure` in production). Only a SHA-256 hash of the session token is stored. Every change request also needs the CSRF token (`x-csrf-token` header).
- The pending first sign-in lives in table `steam_signups` (hashed token, SteamID), linked to a 30-minute `stack5_signup` cookie.
- Email verification tokens are stored hashed. Email goes out through the SMTP settings in `.env`. Without `SMTP_HOST` in development, the link is printed to the server log instead.
- `/register`, `/forgot-password` and `/reset-password` redirect to `/login`.
