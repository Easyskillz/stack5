# Account deletion

Players can delete their own account at any time from the **Account** page (`/account`). They confirm with their password and by typing `DELETE`.

## What gets deleted, immediately

- The account: username, email, password, and all logins
- Ratings they gave and received
- Their stored Steam data and reliability history
- Pending invites and join requests

## What stays

Past teams and matches keep a placeholder called **"Deleted player"** so match history stays consistent. Nothing in it identifies the person.

If they were captain of an active team, the team is disbanded. The same email can sign up again later.

## Technical notes

- Code: `POST /api/account/delete` in `src/server.js`.
- The player row is anonymised (name, Steam link, country, FACEIT data, scores cleared; `deleted_at` set) instead of deleted.
- This is the self-service deletion promised in the [Privacy Policy](legal.md).
