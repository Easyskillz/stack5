/**
 * Match room: after both captains accept, the teams play through CS2's own Private Matchmaking
 * (one captain creates a pool and posts its code here), then both captains report the score.
 *
 *   CONFIRMED  -> both reports agree                     -> COMPLETED
 *              -> reports disagree                       -> DISPUTED (admin decides)
 *              -> RESULT_HOURS pass with one report      -> COMPLETED with that report
 *              -> RESULT_HOURS pass with no report       -> NO_RESULT
 *
 * Only COMPLETED matches count as played (trust "record") and unlock ratings.
 * Players stay locked in a CONFIRMED match; any other end frees their teams (status FINISHED).
 */
import { db } from "./db.js";
import { computeTrust } from "./trust.js";

const H = 3_600_000;
export const RESULT_HOURS = () => Number(process.env.RESULT_HOURS || 6);
const sqlTime = s => s ? Date.parse(String(s).replace(" ", "T") + "Z") : NaN;

export function resultDeadline(m) {
  return m.status === "CONFIRMED" ? (m.confirmed_at || sqlTime(m.created_at)) + RESULT_HOURS() * H : null;
}

/** "13-9" -> [13, 9]; anything else -> null. Scores are always team A first. */
export function parseScore(s) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s || ""));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A CS2 private matchmaking pool code: letters, digits and dashes. */
export function cleanLobbyCode(v) {
  const code = String(v || "").trim().replace(/\s+/g, "");
  return /^[A-Za-z0-9][A-Za-z0-9-]{3,79}$/.test(code) ? code : null;
}

export function matchPlayerIds(m) {
  return db.prepare("SELECT player_id FROM team_members WHERE team_id IN (?,?)").all(m.team_a_id, m.team_b_id).map(r => r.player_id);
}

/** End a match: store the outcome, free both teams, rescore all 10 players. */
export function finishMatch(m, status, scoreA = null, scoreB = null, now = Date.now()) {
  db.transaction(() => {
    db.prepare("UPDATE matches SET status=?, score_a=?, score_b=?, completed_at=? WHERE id=?").run(status, scoreA, scoreB, now, m.id);
    db.prepare("UPDATE teams SET status='FINISHED' WHERE id IN (?,?) AND status='MATCH_CONFIRMED'").run(m.team_a_id, m.team_b_id);
  })();
  for (const id of matchPlayerIds(m)) computeTrust(id);
}

/**
 * A captain reports the score. myScore/theirScore are from the reporting team's point of view.
 * Returns the updated match.
 */
export function submitReport(m, teamId, myScore, theirScore, now = Date.now()) {
  const isA = teamId === m.team_a_id;
  const report = isA ? `${myScore}-${theirScore}` : `${theirScore}-${myScore}`;
  db.prepare(`UPDATE matches SET ${isA ? "report_a=?, reported_a_at=?" : "report_b=?, reported_b_at=?"} WHERE id=?`).run(report, now, m.id);
  const u = db.prepare("SELECT * FROM matches WHERE id=?").get(m.id);
  if (u.report_a && u.report_b) {
    if (u.report_a === u.report_b) { const [a, b] = parseScore(u.report_a); finishMatch(u, "COMPLETED", a, b, now); }
    else if (u.status === "CONFIRMED") finishMatch(u, "DISPUTED", null, null, now);
  }
  return db.prepare("SELECT * FROM matches WHERE id=?").get(m.id);
}

/** Close live matches whose reporting window has passed. Called by the timers loop. */
export function closeOverdueMatches(now = Date.now()) {
  let closed = 0;
  for (const m of db.prepare("SELECT * FROM matches WHERE status='CONFIRMED'").all()) {
    if (now < resultDeadline(m)) continue;
    const single = m.report_a || m.report_b;   // the side that reported wins by default
    if (single) { const [a, b] = parseScore(single); finishMatch(m, "COMPLETED", a, b, now); }
    else finishMatch(m, "NO_RESULT", null, null, now);
    closed++;
  }
  return closed;
}
