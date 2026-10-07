import { db, getTeam, getTeamMembers } from "./db.js";
import { distanceKm, homePoint } from "./regions.js";

// Teams further apart than this (between their players' countries) are never matched: ping gets too high.
export const MAX_MATCH_KM = Number(process.env.MATCH_MAX_KM || 2500);

function avg(numbers) {
  return numbers.length ? numbers.reduce((a,b) => a+b, 0) / numbers.length : 0;
}

export function teamProfile(teamId) {
  const team = getTeam(teamId);
  if (!team) return null;

  return {
    teamId: team.id,
    region: team.region,
    mode: team.mode,
    size: team.size,
    count: team.members.length,
    home: homePoint(team.members.map(p => p.country)),
    // Players without a Premier rating yet (0/empty) don't count towards the team's average.
    avgRating: avg(team.members.map(p => p.premier_rating).filter(r => r > 0)) || null,
    avgTrust: avg(team.members.map(p => p.trust_score || 50)),
    avgReliability: avg(team.members.map(p => p.reliability_score || 50)),
    avgTeamplay: avg(team.members.map(p => p.teamplay_score || 50))
  };
}

// Unknown locations (no country) only match within the same region.
function teamDistanceKm(a, b) {
  if (a.home && b.home) return distanceKm(a.home, b.home);
  return a.region === b.region ? 0 : Infinity;
}

export function compatibility(aId, bId) {
  const a = teamProfile(aId);
  const b = teamProfile(bId);
  if (!a || !b || a.mode !== b.mode || a.count !== a.size || b.count !== b.size) return 0;

  // 5,000 Premier points apart (one colour tier) = no skill compatibility left. Unknown = neutral.
  const skillScore = a.avgRating && b.avgRating ? Math.max(0, 100 - Math.abs(a.avgRating - b.avgRating) / 50) : 50;
  const trustScore = Math.max(0, 100 - Math.abs(a.avgTrust - b.avgTrust));
  const km = teamDistanceKm(a, b);
  if (km > MAX_MATCH_KM) return 0;
  const distanceScore = Math.max(0, 100 - km / (MAX_MATCH_KM / 100));

  return Math.round(
    skillScore * 0.55 +
    trustScore * 0.2 +
    distanceScore * 0.25
  );
}

export function runMatchmaking() {
  const queued = db.prepare(`
    SELECT team_id
    FROM queue
    ORDER BY queued_at
  `).all();

  const created = [];

  for (let i = 0; i < queued.length; i++) {
    const aId = queued[i].team_id;
    const a = getTeam(aId);

    if (!a || a.count !== a.size) continue;

    let best = null;
    let bestIndex = -1;

    for (let j = i + 1; j < queued.length; j++) {
      const bId = queued[j].team_id;
      const b = getTeam(bId);

      if (!b || b.mode !== a.mode || b.count !== b.size) continue;

      const score = compatibility(aId, bId);
      if (!score) continue;   // too far apart (or not two full teams of the same mode)

      if (!best || score > best.score) {
        best = { bId, score };
        bestIndex = j;
      }
    }

    if (best) {
      const match = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO matches(team_a_id, team_b_id, compatibility, scheduled_at)
          VALUES(?,?,?,?)
        `).run(
          aId,
          best.bId,
          best.score,
          a.scheduled_at || null
        );

        db.prepare(`
          DELETE FROM queue
          WHERE team_id IN (?,?)
        `).run(aId, best.bId);

        db.prepare(`
          UPDATE teams
          SET status='MATCHED'
          WHERE id IN (?,?)
        `).run(aId, best.bId);

        return r;
      })();

      created.push({
        matchId: match.lastInsertRowid,
        teamA: aId,
        teamB: best.bId,
        compatibility: best.score
      });

      queued.splice(bestIndex, 1);
    }
  }

  return created;
}
