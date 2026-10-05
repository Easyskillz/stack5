# Trust Score

A 0–100 reputation score on every player, shown on their profile with a breakdown. CleanLobby is a reputation layer, **not an anti-cheat**.

## How it's explained to players

- **Bands:** 0–39 Low, 40–59 Fair, **60–74 Good**, 75–100 Excellent. "60 and above is good" is shown under every score. A new player with a solid Steam account starts around 65.
- **Tips:** every score panel lists up to 3 "How to raise it" tips picked from its weakest parts (fewer than 5 ratings, low ratings, reliability incidents, under 30 matches, private Steam data). Code: `TRUST_BANDS`, `trustTips()` in `public/app.js`.
- **Full explanation:** the guide's "How the Trust Score works" section (`/guide#trust-score`), linked from every score panel and the match room's rating step, plus two FAQ entries ("What is a good Trust Score?", "How do I raise my Trust Score?").

## What it's made of

| Part | Weight | Based on |
|---|---|---|
| Identity | 35% | Steam account age, CS2 hours, Steam level |
| Peer reputation | 30% | 👍/👎 votes on comms, teamplay, attitude (teammates) and attitude, sportsmanship (opponents) from players they played a completed match with. One voter's votes for one match count as one rating, split across the aspects. Older 1–5★ ratings from before votes still count (1★ = 0, 5★ = 1). Shrunk toward a neutral 50% until enough votes exist, weighted by the voter's trust and account age, fading after ~3 months, halved for players with 3+ completed matches together. The profile shows the % of 👍 per aspect. |
| Reliability | 25% | Accepting matches versus declining, letting them expire, or leaving a queued team |
| Track record | 10% | Completed matches (with an agreed result) played on CleanLobby |

## Rules

- **Only proven Steam data counts.** Identity (and the ban caps) use Steam data only once the player signed in through Steam. An unverified Steam link, which only old test accounts can have, counts as neutral, because it could be anyone's.
- **Bans cap the score.** A VAC or game ban in the last 2 years caps it at 20; an older ban subtracts points. A Steam community ban caps it at 40.
- **New players start near the middle.** Missing data counts as neutral, and hidden data (a private profile) counts as slightly below neutral. Nobody is punished for a source CleanLobby doesn't have.
- **Ratings only after a completed match.** Players can only rate people they shared a match with that has a result (see [Match room](match-room.md)). Ratings from older accounts and from players who shared more matches count more, and scores move toward neutral until enough ratings exist.
- **Reliability marks fade.** Declining a match, letting one expire, or leaving a queued team counts against reliability, and each mark loses half its weight every 90 days.
- **Confidence label:** New player, Building or Established, depending on how much data backs the score.
- **FACEIT is not part of the score.** FACEIT's API terms forbid deriving scores from their data, so that share of Identity is held neutral for everyone. FACEIT data is shown live on profiles instead.

## When it updates

After profile creation, ratings, match events and Steam refreshes. Steam data older than 7 days is refreshed automatically in small batches every 6 hours.

## Technical notes

- Code: `src/trust.js` (`computeTrust`, `recordEvent`, `WEIGHTS`).
- Stored on the player: `trust_score`, `reliability_score`, `teamplay_score`, `trust_confidence`, `trust_breakdown` (JSON).
- Admin recompute for everyone: `POST /api/admin/trust/recompute`.
