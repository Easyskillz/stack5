# Match room

What happens after both captains accept a match: the teams play through **CS2 Private Matchmaking** on Valve servers, then report the score on STACK5.

## How it works for players

When a match is confirmed, all 10 players see the **match room** on the Play page:

1. **Each captain** invites their 4 teammates to their CS2 party (Steam buttons next to every player). Each team must be **one 5-player party**: CS2 keeps parties together, but players who enter alone can be shuffled between teams.
2. **One captain hosts:** in CS2, *Play → Matchmaking → Private Matchmaking → Create a Private Matchmaking Pool*, copies the full code and pastes it on STACK5. Either captain can post it, or replace a wrong one.
3. **The other captain:** *Private Matchmaking → Manually Enter a Code*, pastes the code (all 10 players see it with a **Copy** button).
4. **Both parties press GO.** CS2 starts the match when all 10 players are searching. It's unrated in CS2 (no CS Rating or XP); STACK5 records the result.
5. **After the game,** each captain reports the score from their side (e.g. 13 and 9).

Every player row shows two flags: **country** and **language**. Each team's flags show its most common country and language.

## Results

| Situation | Outcome |
|---|---|
| Both captains report the same score | **COMPLETED**: the result is final |
| They report different scores | **DISPUTED**: an admin decides (Admin → Matches → *Set result* or *No result*). Captains can still correct their report; if the reports then agree, the result is final |
| 6 hours pass and only one captain reported | That score counts (**COMPLETED**), so a losing captain can't block the result by staying silent |
| 6 hours pass with no report | **NO_RESULT**: the match doesn't count for anyone |

Only **completed** matches count as played ([Trust Score](trust-score.md) "track record") and unlock ratings.

## Ratings

Once a match is completed, every player can rate everyone else from that match, teammates and opponents (1–5 stars), from the Play page for 24 hours. Rated players show **Rated ✓** (the rating can still be changed). Ratings feed the Trust Score.

## Locking

While a match is live, its 10 players can't create or join another team, leave, disband, or delete their account. When the match ends (any outcome, including a dispute), both teams are marked **Finished** and everyone is free to build a new team.

## Privacy

The private matchmaking code and the captains' raw reports are only shown to the 10 players (and admins). Public match pages and the Matches list never include them.

## Technical notes

- Code: `src/matches.js` (`submitReport`, `finishMatch`, `closeOverdueMatches`), routes `POST /api/matches/:id/code`, `POST /api/matches/:id/result`, `POST /api/admin/matches/:id/result`, public `GET /api/matches` in `src/server.js`; UI `matchPanel()` in `public/app.js`.
- Match status: `PENDING → CONFIRMED → COMPLETED | DISPUTED | NO_RESULT`. Scores are stored team A first (`score_a`, `score_b`); reports as `report_a`/`report_b` ("13-9", team A first).
- Settings: `RESULT_HOURS` (default 6). The check runs with the other [timers](timers.md).
- How CS2 Private Matchmaking works was taken from public guides (October 2026). Watch the first real games, especially that both 5-player parties stay together.
