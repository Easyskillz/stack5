# Queue & matchmaking

## Queueing

The captain of a full team (5 players) clicks **Queue**. All five members are re-checked for [eligibility](eligibility.md) first. The captain can leave the queue at any time.

## How opponents are picked

Matchmaking runs automatically every 30 seconds. Queued teams are processed first-come, first-served. Each team is paired with the best-scoring team **from the same region**, using a compatibility score (0–100):

| Factor | Weight |
|---|---|
| Average FACEIT level gap | 45% |
| Average Elo gap | 25% |
| Average Trust Score gap | 15% |
| Same region | 15% |

FACEIT level and Elo here are self-reported on the profile.

## Accepting a match

When a match is found, both captains see it on the Play page with a countdown:

- **Both accept:** the match is **confirmed**. Players can now rate each other, which feeds the [Trust Score](trust-score.md).
- **One declines:** the match is cancelled. The declining team goes back to recruiting and the other team goes back into the queue. Declining counts against the decliner's reliability.
- **Time runs out (5 minutes):** see [Timers](timers.md).

## Not built yet

Reporting match results, the Matches page, and Rankings.

## Technical notes

- Code: `src/matchmaking.js` (`compatibility`, `runMatchmaking`); queue and match routes in `src/server.js`.
- Settings: `MATCHMAKING_INTERVAL_SECONDS` (default 30; 0 turns automatic matchmaking off). Admins can also trigger a run manually.
