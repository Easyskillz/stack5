# CleanLobby BETA — V2

CS2 team matchmaking/community MVP.

## V2
- "Sign in through Steam" is the only way to sign in (no CleanLobby passwords). First sign-in picks a username and accepts the Terms; email is optional.
- HTTP-only SameSite session cookie + CSRF token.
- Player profile required before teams/queue/matchmaking.
- CleanLobby never sees a Steam password and has no inventory or trade access.
- Full docs: [docs/README.md](docs/README.md).
- FACEIT-style regions plus dedicated North Africa (`NAFR`).
- Existing SQLite database is migration-compatible.

## Production note
Set `PUBLIC_BASE_URL` (Steam returns players there) and SMTP settings (optional email) before public use. Review auth, rate limits, backups, terms/privacy and email deliverability before opening the beta widely.
