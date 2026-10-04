/**
 * STACK5 Trust Score (0-100).
 *
 *   identity    35%  Steam account age, CS2 hours, Steam level, FACEIT history
 *   peer        30%  ratings from players you shared a confirmed match with
 *   reliability 25%  accepting matches vs declining / abandoning queued teams
 *   record      10%  confirmed matches played on STACK5
 *
 * Hard caps: recent VAC/game ban or FACEIT cheating ban -> max 20.
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
  const steamOn = !!process.env.STEAM_API_KEY, faceitOn = !!process.env.FACEIT_API_KEY;
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

  if (faceitOn && ext?.faceit_fetched_at && !ext.faceit_error) {
    if (ext.faceit_id) {
      const yrs = ext.faceit_activated_at ? (now - ext.faceit_activated_at) / (365 * DAY) : 0;
      faceit = clamp01(0.6 * logScale(ext.faceit_matches || 0, 800) + 0.4 * logScale(yrs, 4));
      notes.push(`FACEIT ${ext.faceit_matches || 0} matches`);
    } else { faceit = 0.3; notes.push("No FACEIT account"); }
  }

  const score = 100 * (0.35 * age + 0.25 * hours + 0.15 * level + 0.25 * faceit);
  return { score, notes, sources: (haveSteam ? 1 : 0) + (faceitOn && ext?.faceit_id ? 1 : 0) };
}

// ---------- peer ratings ----------
function peerPart(playerId, now) {
  const rows = db.prepare(`
    SELECT r.rating, r.created_at, r.from_player_id, p.trust_score AS rater_trust, p.created_at AS rater_created
    FROM trust_ratings r JOIN players p ON p.id=r.from_player_id
    WHERE r.to_player_id=?`).all(playerId);
  const PRIOR = 3, PRIOR_WEIGHT = 3;               // shrink toward a neutral 3/5 until enough ratings exist
  let sum = 0, wsum = 0;
  for (const r of rows) {
    const raterAgeDays = (now - parseTs(r.rater_created)) / DAY;
    // Raters count more with higher trust and older accounts (brand-new accounts still count 30%).
    let w = clamp01((r.rater_trust ?? 50) / 100) * (0.3 + 0.7 * clamp01((raterAgeDays || 0) / 30)) * decay(now - parseTs(r.created_at), 90);
    // Same group repeatedly vouching for each other counts less.
    const shared = db.prepare(`SELECT COUNT(*) c FROM matches m
      JOIN team_members a ON a.team_id IN (m.team_a_id,m.team_b_id) AND a.player_id=?
      JOIN team_members b ON b.team_id=a.team_id AND b.player_id=?
      WHERE m.status='CONFIRMED'`).get(r.from_player_id, playerId).c;
    if (shared >= 3) w *= 0.5;
    sum += w * r.rating; wsum += w;
  }
  const mean = (sum + PRIOR * PRIOR_WEIGHT) / (wsum + PRIOR_WEIGHT);
  return { score: 100 * (mean - 1) / 4, count: rows.length, avg: rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : null };
}

// ---------- reliability + record ----------
const BAD_EVENTS = { MATCH_DECLINED: 1, LEFT_QUEUED_TEAM: 1, MATCH_EXPIRED: 1.5 };

function confirmedMatches(playerId) {
  return db.prepare(`SELECT COUNT(DISTINCT m.id) c FROM matches m
    JOIN team_members tm ON tm.team_id IN (m.team_a_id,m.team_b_id) AND tm.player_id=?
    WHERE m.status='CONFIRMED'`).get(playerId).c;
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
  if (ext?.faceit_bans) {
    for (const b of JSON.parse(ext.faceit_bans || "[]")) {
      const active = !b.ends_at || Date.parse(b.ends_at) > now;
      const cheating = /cheat|hack/i.test(`${b.reason} ${b.type}`);
      const recent = Date.parse(b.starts_at) > now - 730 * DAY;
      if (cheating && recent) { flags.push("FACEIT cheating ban"); cap = Math.min(cap, 20); }
      else if (active) { flags.push(`Active FACEIT ban (${b.reason || b.type})`); cap = Math.min(cap, 40); }
    }
  }
  return { cap, penalty, flags };
}

// ---------- main ----------
export function computeTrust(playerId, now = Date.now()) {
  const player = db.prepare("SELECT id FROM players WHERE id=?").get(playerId);
  if (!player) return null;
  const ext = db.prepare("SELECT * FROM player_external WHERE player_id=?").get(playerId);
  const played = confirmedMatches(playerId);

  const identity = identityPart(ext, now);
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
      peer:        { score: Math.round(peer.score), weight: WEIGHTS.peer, ratings: peer.count, avg: peer.avg && Math.round(peer.avg * 10) / 10 },
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
  const ids = db.prepare("SELECT id FROM players").all().map(r => r.id);
  for (const id of ids) computeTrust(id);
  return ids.length;
}
