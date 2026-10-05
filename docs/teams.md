# Teams

CleanLobby is built around full 5-player teams ("5-stacks"). Everything happens on the Play page (`/play`).

## Creating a team

An [eligible](eligibility.md) player with no active team can create one with a name (2–40 characters), a region (their own by default) and an optional CS2 Premier rating range (0–40,000, default any). The range is shown on the team, it doesn't block anyone from joining. The creator becomes the **captain**.

A player can be in only one active team at a time.

## Getting players in

Teams are **invite-only**; nobody can join without the captain's approval. There are two ways in:

- **Invites:** the captain invites a player by name. The player accepts or declines.
- **Join requests:** a player finds an open team (under Teams) and requests to join. The captain accepts or declines.

Both are refused if the player isn't eligible, is already in a team, or the team is full or no longer recruiting.

## Captain actions

- **Remove** a member
- **Transfer captaincy** to another member
- **Disband** the team

The captain can't leave without transferring captaincy or disbanding first.

## After a match is found

Nobody can leave, be removed, or disband the team once a match has been found.

## Team lifecycle

`OPEN` (recruiting) → `READY` (5 players, in the queue) → `MATCHED` → `CONFIRMED`. A team can also end up `CANCELLED`.

Open teams don't last forever; see [Timers](timers.md).

## Technical notes

- Code: `/api/teams*`, `/api/team-invites*`, `/api/join-requests*` in `src/server.js`; Play hub in `public/app.js`.
- Tables: `teams`, `team_members`, `team_invites`, `team_join_requests`.
- Leaving a team that is in the queue counts against the player's reliability (see [Trust Score](trust-score.md)).
