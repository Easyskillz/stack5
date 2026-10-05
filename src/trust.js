/**
 * CleanLobby Trust Score (0-100).
 *
 *   identity    35%  Steam account age, CS2 hours, Steam level (FACEIT share held neutral: API terms).
 *                    Only counts once the player proved the Steam account is theirs (Sign in through Steam).
 *   peer        30%  👍/👎 votes on comms, teamplay, attitude and sportsmanship from players you shared a
 *                    completed match with (plus older 1-5★ ratings from before votes existed)
 *   reliability 25%  accepting matches vs declining / abandoning queued teams
 *   record      10%  matches played on CleanLobby with an agreed result (COMPLETED)
 *
 * Hard caps: recent VAC/game ban -> max 20.
 * Missing data counts as neutral (0.5); hidden-but-requested data as slightly below (0.35),
 * so new players start near the middle and nobody is punished for a source we don't have.
 */
import { db } from "./db.js";

export const WEIGHTS = { identity: 0.35, peer: 0.30, reliability: 0.25, record: 0.10 };
const DAY = 86_400_000;
const NEUTRAL = 0.5, HIDDEN = 0.35;

const clamp01 = x => Math.max(0, Math.min(1, x));
const logScale = (x, full) => clamp01(Math.log1p(Math.max(0, x)) / Math.log1p(full));
const decay = (ageMs, halfLifeDays) => Math.pow(0.5, ageMs / (halfLifeDays * DAY));
const parseTs = v => typeof v === "number" ? v : (v ? Date.parse(String(v).replace(" ", "T") + (String(v).includes("Z") ? "" : "Z")) : NaN);

// ---------- identity ----------
function identityPart(ext, now) {
  const notes = [];
  const steamOn = !!process.env.STEAM_API_KEY;
  const haveSteam = ext && ext.steam_fetched_at && !ext.steam_error;

  let age = NEUTRAL, hours = NEUTRAL, level = NEUTRAL, faceit = NEUTRAL;
  if (haveSteam) {
    if (ext.steam_created_at) {
      const years = (now - ext.steam_created_at) / (365 * DAY);
      age = years < 0.25 ? 0 : logScale(years, 6);
      notes.push(`Steam account ${years >= 1 ? Math.floor(years) + "y" : Math.floor(years * 12) + "mo"} old`);
    } else { age = HIDDEN; notes.push("Steam profile private"); }
    if (ext.cs2_minutes != null) { hours = logScale(ext.cs2_minutes / 60, 2000); notes.push(`${Math.round(ext.cs2_minutes / 60)}h CS2`); }
    else { hours = HIDDEN; notes.push("CS2 hours hidden"); }
    if (ext.steam_level != null) level = clamp01(ext.steam_level / 25);
  } else if (steamOn) notes.push("Steam data pending");

  // FACEIT stays neutral: its API terms (5.4) forbid deriving scores from its data. Shown live on profiles instead.

  const score = 100 * (0.35 * age + 0.25 * hours + 0.15 * level + 0.25 * faceit);
  return { score, notes, sources: haveSteam ? 1 : 0 };
}

// ---------- peer ratings ----------
export const ASPECTS = ["comms", "teamplay", "attitude", "sportsmanship"];
function peerPart(playerId, now) {
  const rows = db.prepare(`
    SELECT r.rating, r.created_at, r.from_player_id, p.trust_score AS rater_trust, p.created_at AS rater_created
    FROM trust_ratings r JOIN players p ON p.id=r.from_player_id
    WHERE r.to_player_id=?`).all(playerId);
  // Everything is on a 0-1 scale (1★ = 0, 5★ = 1; 👎 = 0, 👍 = 1), shrunk toward a neutral 0.5 until enough exists.
  const PRIOR = 0.5, PRIOR_WEIGHT = 3;
  const sharedMatches = (fromId) => db.prepare(`SELECT COUNT(*) c FROM matches m
      JOIN team_members a ON a.team_id IN (m.team_a_id,m.team_b_id) AND a.player_id=?
      JOIN team_members b ON b.team_id=a.team_id AND b.player_id=?
      WHERE m.status='COMPLETED'`).get(fromId, playerId).c;
  // Raters count more with higher trust and older accounts (brand-new accounts still count 30%), recent ones more.
  const raterWeight = (trust, created, at) => clamp01((trust ?? 50) / 100) * (0.3 + 0.7 * clamp01(((now - parseTs(created)) / DAY || 0) / 30)) * decay(now - at, 90);
  let sum = 0, wsum = 0;
  // 👍/👎 votes: one voter's card for one match counts as one rating, split across the aspects they voted on.
  const votes = db.prepare(`SELECT v.match_id, v.from_player_id, v.aspect, v.vote, v.created_at, p.trust_score AS rater_trust, p.created_at AS rater_created
    FROM player_votes v JOIN players p ON p.id=v.from_player_id WHERE v.to_player_id=?`).all(playerId);
  const cards = new Map(), aspects = Object.fromEntries(ASPECTS.map(a => [a, { up: 0, down: 0 }]));
  for (const v of votes) {
    const k = v.match_id + ":" + v.from_player_id;
    if (!cards.has(k)) cards.set(k, []);
    cards.get(k).push(v);
    aspects[v.aspect][v.vote > 0 ? "up" : "down"]++;
  }
  const damp = new Map();
  for (const card of cards.values()) {
    const f = card[0];
    if (!damp.has(f.from_player_id)) damp.set(f.from_player_id, sharedMatches(f.from_player_id) >= 3 ? 0.5 : 1);
    const w = raterWeight(f.rater_trust, f.rater_created, f.created_at) * damp.get(f.from_player_id) / card.length;
    for (const v of card) { sum += w * (v.vote > 0 ? 1 : 0); wsum += w; }
  }
  // Older 1-5★ ratings (before votes) still count.
  for (const r of rows) {
    const raterAgeDays = (now - parseTs(r.rater_created)) / DAY;
    // Raters count more with higher trust and older accounts (brand-new accounts still count 30%).
    let w = raterWeight(r.rater_trust, r.rater_created, parseTs(r.created_at));
    // Same group repeatedly vouching for each other counts less.
    if (sharedMatches(r.from_player_id) >= 3) w *= 0.5;
    sum += w * (r.rating - 1) / 4; wsum += w;
  }
  const mean = (sum + PRIOR * PRIOR_WEIGHT) / (wsum + PRIOR_WEIGHT);
  const up = votes.filter(v => v.vote > 0).length;
  return { score: 100 * mean, count: rows.length + cards.size, votes: votes.length, positive: votes.length ? Math.round(100 * up / votes.length) : null,
    aspects, avg: rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : null };
}

// ---------- reliability + record ----------
const BAD_EVENTS = { MATCH_DECLINED: 1, LEFT_QUEUED_TEAM: 1, MATCH_EXPIRED: 1.5 };

function confirmedMatches(playerId) {
  return db.prepare(`SELECT COUNT(DISTINCT m.id) c FROM matches m
    JOIN team_members tm ON tm.team_id IN (m.team_a_id,m.team_b_id) AND tm.player_id=?
    WHERE m.status='COMPLETED'`).get(playerId).c;
}

function reliabilityPart(playerId, now, played) {
  const events = db.prepare("SELECT type, created_at FROM player_events WHERE player_id=?").all(playerId);
  let bad = 0;
  for (const e of events) if (BAD_EVENTS[e.type]) bad += BAD_EVENTS[e.type] * decay(now - e.created_at, 90);
  // Prior of 2 good / 0.5 bad => new players start at 80.
  const score = 100 * (played + 2) / (played + 2 + 2 * bad + 0.5);
  return { score, bad: Math.round(bad * 10) / 10 };
}

// ---------- caps ----------
function caps(ext, now) {
  const flags = [];
  let cap = 100, penalty = 0;
  if (ext?.steam_fetched_at && !ext.steam_error) {
    const bans = (ext.vac_bans || 0) + (ext.game_bans || 0);
    if (bans > 0) {
      const recent = ext.days_since_last_ban != null && ext.days_since_last_ban < 730;
      flags.push(`${ext.vac_bans ? `${ext.vac_bans} VAC` : ""}${ext.vac_bans && ext.game_bans ? " + " : ""}${ext.game_bans ? `${ext.game_bans} game` : ""} ban(s), last ${ext.days_since_last_ban} days ago`);
      if (recent) cap = Math.min(cap, 20); else penalty += Math.min(30, 15 * bans);
    }
    if (ext.community_banned) { flags.push("Steam community ban"); cap = Math.min(cap, 40); }
  }
  return { cap, penalty, flags };
}

// ---------- main ----------
export function computeTrust(playerId, now = Date.now()) {
  const player = db.prepare("SELECT id, steam_verified FROM players WHERE id=?").get(playerId);
  if (!player) return null;
  // Steam data from an unproven (pasted) profile could belong to anyone, so it is ignored.
  const ext = player.steam_verified ? db.prepare("SELECT * FROM player_external WHERE player_id=?").get(playerId) : null;
  const played = confirmedMatches(playerId);

  const identity = identityPart(ext, now);
  if (!player.steam_verified) identity.notes = ["Steam account not verified"];
  const peer = peerPart(playerId, now);
  const reliability = reliabilityPart(playerId, now, played);
  const record = { score: 100 * logScale(played, 30), played };
  const { cap, penalty, flags } = caps(ext, now);

  const raw = WEIGHTS.identity * identity.score + WEIGHTS.peer * peer.score +
              WEIGHTS.reliability * reliability.score + WEIGHTS.record * record.score;
  const total = Math.round(Math.max(0, Math.min(cap, raw - penalty)));

  const evidence = identity.sources + (peer.count >= 3 ? 1 : 0) + (peer.count >= 10 ? 1 : 0) + (played >= 3 ? 1 : 0) + (played >= 10 ? 1 : 0);
  const confidence = evidence >= 4 ? "ESTABLISHED" : evidence >= 2 ? "BUILDING" : "NEW";

  const breakdown = {
    total, confidence, flags, capped: cap < 100 && raw - penalty > cap,
    parts: {
      identity:    { score: Math.round(identity.score), weight: WEIGHTS.identity, notes: identity.notes },
      peer:        { score: Math.round(peer.score), weight: WEIGHTS.peer, ratings: peer.count, votes: peer.votes, positive: peer.positive, aspects: peer.aspects, avg: peer.avg && Math.round(peer.avg * 10) / 10 },
      reliability: { score: Math.round(reliability.score), weight: WEIGHTS.reliability, incidents: reliability.bad },
      record:      { score: Math.round(record.score), weight: WEIGHTS.record, matches: played }
    }
  };
  db.prepare(`UPDATE players SET trust_score=?, reliability_score=?, teamplay_score=?, trust_confidence=?, trust_breakdown=?, trust_updated_at=? WHERE id=?`)
    .run(total, Math.round(reliability.score), Math.round(peer.score), confidence, JSON.stringify(breakdown), now, playerId);
  return breakdown;
}

export function recordEvent(playerId, type, refId = null) {
  db.prepare("INSERT INTO player_events(player_id,type,ref_id,created_at) VALUES(?,?,?,?)").run(playerId, type, refId, Date.now());
}

export function recomputeAll() {
  const ids = db.prepare("SELECT id FROM players WHERE deleted_at IS NULL").all().map(r => r.id);
  for (const id of ids) computeTrust(id);
  return ids.length;
}
