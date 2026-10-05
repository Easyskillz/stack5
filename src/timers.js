/**
 * Time limits so nothing on STACK5 stays stuck forever (configurable via env):
 *   - OPEN team with no new member for TEAM_OPEN_HOURS (default 6)  -> disbanded
 *   - team in the queue for QUEUE_HOURS (default 2)                  -> back to OPEN
 *   - found match not accepted within MATCH_ACCEPT_MINUTES (default 5) -> expired;
 *     a team that accepted goes back in the queue, a team that didn't goes back to OPEN
 *     and its captain gets a reliability mark.
 *   - confirmed match with no agreed result after RESULT_HOURS (default 6) -> closed (see matches.js)
 */
import { db } from "./db.js";
import { recordEvent, computeTrust } from "./trust.js";
import { closeOverdueMatches } from "./matches.js";

const H = 3_600_000, M = 60_000;
export const LIMITS = {
  teamOpenMs: () => Number(process.env.TEAM_OPEN_HOURS || 6) * H,
  queueMs: () => Number(process.env.QUEUE_HOURS || 2) * H,
  matchAcceptMs: () => Number(process.env.MATCH_ACCEPT_MINUTES || 5) * M
};

// SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
export const sqlTime = s => s ? Date.parse(String(s).replace(" ", "T") + "Z") : NaN;
const teamActivity = t => t.last_activity_at || sqlTime(t.created_at);

export function teamExpiresAt(team) { return team.status === "OPEN" ? teamActivity(team) + LIMITS.teamOpenMs() : null; }
export function queueExpiresAt(queuedAt) { return sqlTime(queuedAt) + LIMITS.queueMs(); }
export function matchExpiresAt(match) { return match.status === "PENDING" ? sqlTime(match.created_at) + LIMITS.matchAcceptMs() : null; }

export function touchTeam(teamId, now = Date.now()) {
  db.prepare("UPDATE teams SET last_activity_at=? WHERE id=?").run(now, teamId);
}

function disband(teamId) {
  db.prepare("UPDATE teams SET status='CANCELLED' WHERE id=?").run(teamId);
  db.prepare("DELETE FROM queue WHERE team_id=?").run(teamId);
  db.prepare("UPDATE team_invites SET status='CANCELLED',responded_at=CURRENT_TIMESTAMP WHERE team_id=? AND status='PENDING'").run(teamId);
  db.prepare("UPDATE team_join_requests SET status='EXPIRED',responded_at=CURRENT_TIMESTAMP WHERE team_id=? AND status='PENDING'").run(teamId);
}

export function expireStale(now = Date.now()) {
  const out = { teams: 0, queue: 0, matches: 0, results: 0 };
  const rescore = new Set();

  db.transaction(() => {
    // 1. Pending matches past the accept window.
    for (const m of db.prepare("SELECT * FROM matches WHERE status='PENDING'").all()) {
      if (now < matchExpiresAt(m)) continue;
      db.prepare("UPDATE matches SET status='EXPIRED' WHERE id=?").run(m.id);
      for (const [teamId, accepted] of [[m.team_a_id, m.accepted_a], [m.team_b_id, m.accepted_b]]) {
        if (accepted) {
          db.prepare("UPDATE teams SET status='READY' WHERE id=?").run(teamId);
          db.prepare("INSERT OR IGNORE INTO queue(team_id) VALUES(?)").run(teamId);
        } else {
          db.prepare("UPDATE teams SET status='OPEN', last_activity_at=? WHERE id=?").run(now, teamId);
          const cap = db.prepare("SELECT captain_id FROM teams WHERE id=?").get(teamId)?.captain_id;
          if (cap) { recordEvent(cap, "MATCH_EXPIRED", m.id); rescore.add(cap); }
        }
      }
      out.matches++;
    }

    // 2. Teams waiting in the queue too long go back to OPEN (with a fresh recruiting window).
    for (const q of db.prepare("SELECT q.team_id, q.queued_at FROM queue q JOIN teams t ON t.id=q.team_id WHERE t.status='READY'").all()) {
      if (now < queueExpiresAt(q.queued_at)) continue;
      db.prepare("DELETE FROM queue WHERE team_id=?").run(q.team_id);
      db.prepare("UPDATE teams SET status='OPEN', last_activity_at=? WHERE id=?").run(now, q.team_id);
      out.queue++;
    }

    // 3. OPEN teams nobody joined in time are disbanded.
    for (const t of db.prepare("SELECT * FROM teams WHERE status='OPEN'").all()) {
      if (now < teamExpiresAt(t)) continue;
      disband(t.id);
      out.teams++;
    }
  })();

  for (const id of rescore) computeTrust(id);
  out.results = closeOverdueMatches(now);
  return out;
}
