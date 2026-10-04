# STACK5 BETA — V2

CS2 team matchmaking/community MVP.

## V2
- Required STACK5 account with username, email, password and Terms acceptance.
- Passwords are hashed with Node scrypt; no plaintext passwords.
- Email verification before player profile completion. Configure SMTP in `.env`.
- HTTP-only SameSite session cookie + CSRF token.
- Player profile required before teams/queue/matchmaking.
- Steam public profile URL only; STACK5 never asks for a Steam password.
- FACEIT-style regions plus dedicated North Africa (`NAFR`).
- Existing SQLite database is migration-compatible.

## Production note
Set `PUBLIC_BASE_URL` and SMTP settings before public use. Review auth, rate limits, backups, terms/privacy and email deliverability before opening the beta widely.
