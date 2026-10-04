import { db, getTeam, getTeamMembers } from "./db.js";

function avg(numbers) {
  return numbers.length ? numbers.reduce((a,b) => a+b, 0) / numbers.length : 0;
}

export function teamProfile(teamId) {
  const team = getTeam(teamId);
  if (!team) return null;

  return {
    teamId: team.id,
    region: team.region,
    minLevel: team.min_level,
    maxLevel: team.max_level,
    count: team.members.length,
    avgLevel: avg(team.members.map(p => p.faceit_level || 0)),
    avgElo: avg(team.members.map(p => p.faceit_elo || 0)),
    avgTrust: avg(team.members.map(p => p.trust_score || 50)),
    avgReliability: avg(team.members.map(p => p.reliability_score || 50)),
    avgTeamplay: avg(team.members.map(p => p.teamplay_score || 50))
  };
}

export function compatibility(aId, bId) {
  const a = teamProfile(aId);
  const b = teamProfile(bId);
  if (!a || !b || a.count !== 5 || b.count !== 5) return 0;

  const levelGap = Math.abs(a.avgLevel - b.avgLevel);
  const eloGap = Math.abs(a.avgElo - b.avgElo);

  const skillScore = Math.max(0, 100 - levelGap * 12);
  const eloScore = Math.max(0, 100 - eloGap / 35);
  const trustScore = Math.max(0, 100 - Math.abs(a.avgTrust - b.avgTrust));
  const regionScore = a.region === b.region ? 100 : 50;

  return Math.round(
    skillScore * 0.45 +
    eloScore * 0.25 +
    trustScore * 0.15 +
    regionScore * 0.15
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

    if (!a || a.count !== 5) continue;

    let best = null;
    let bestIndex = -1;

    for (let j = i + 1; j < queued.length; j++) {
      const bId = queued[j].team_id;
      const b = getTeam(bId);

      if (!b || b.count !== 5 || b.region !== a.region) continue;

      const score = compatibility(aId, bId);

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
