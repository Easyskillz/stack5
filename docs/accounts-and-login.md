# Accounts & login

Every player needs a STACK5 account before doing anything beyond browsing.

## How it works for players

1. **Sign up** at `/register` with a username, email and password, and accept the Terms and Privacy Policy (players confirm they are 16 or older).
2. **Verify the email.** STACK5 sends a link that is valid for 24 hours. Until it is clicked, the player can log in but can't create a player profile. The link can be re-sent from the login page.
3. **Log in** at `/login` with email and password. The login lasts 30 days.
4. **Forgot password:** `/forgot-password` emails a reset link valid for 1 hour. Resetting the password logs the account out everywhere.

## Rules

- Username: 3–24 characters, letters, numbers or underscore. Unique, ignoring case.
- Email: unique, ignoring case.
- Password: at least 10 characters.
- The "forgot password" and "resend verification" pages never reveal whether an email has an account.
- Each IP address can make at most 40 requests per minute to the same API endpoint.

## Next step

After verifying the email, the player [signs in through Steam](steam-verification.md) and then [sets up their profile](player-profile.md).

## Technical notes

- Code: `src/server.js` (`/api/auth/*`, `/verify-email`, `/reset-password`), pages in `public/pages/`.
- Passwords are hashed with Node's scrypt and a per-account salt; never stored in plain text.
- The session is an HTTP-only `SameSite=Lax` cookie (`Secure` in production). Only a SHA-256 hash of the session token is stored. Every change request also needs the CSRF token returned at login (`x-csrf-token` header).
- Email verification and reset tokens are stored hashed too.
- Email goes out through the SMTP settings in `.env`. Without `SMTP_HOST` in development, the link is printed to the server log instead; in production that is an error.
