# Timers

Time limits so nothing on STACK5 stays stuck forever. Players see live countdowns on the Play page.

| Situation | Limit | What happens |
|---|---|---|
| Open team with no new member | **6 hours** | The team is disbanded. Pending invites and join requests are cancelled. |
| Team waiting in the queue | **2 hours** | The team leaves the queue and goes back to recruiting, with a fresh 6-hour window. |
| Found match not accepted | **5 minutes** | The match expires. A team that accepted goes back into the queue. A team that didn't goes back to recruiting, and its captain gets a reliability mark. |
| Confirmed match without an agreed result | **6 hours** | One captain reported: that score counts. Nobody reported: the match closes with no result. See [Match room](match-room.md). |

The 6-hour team timer restarts whenever a new member joins.

## Technical notes

- Code: `src/timers.js` (`expireStale`), checked every `TIMERS_INTERVAL_SECONDS` (default 30).
- Settings: `TEAM_OPEN_HOURS` (6), `QUEUE_HOURS` (2), `MATCH_ACCEPT_MINUTES` (5), `RESULT_HOURS` (6).
- The reliability mark is the `MATCH_EXPIRED` event; see [Trust Score](trust-score.md).
