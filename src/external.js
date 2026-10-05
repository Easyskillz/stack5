/**
 * External identity sources for the STACK5 trust score.
 *
 * - Steam Web API (STEAM_API_KEY): bans, account age, level, CS2 playtime.
 * - FACEIT Data API (FACEIT_API_KEY, optional): live profile panel only (level, elo, bans).
 *   FACEIT's API terms (5.4) forbid permanent copies and derivative works, so like Leetify
 *   it is proxied live (short in-memory cache), never stored and never feeds the trust score.
 * - Leetify public API (LEETIFY_API_KEY optional): live profile panel only.
 *   Leetify's developer guidelines forbid storing or rescaling their data, so it is
 *   proxied live (short in-memory cache) and never feeds the stored trust score.
 */
import { db } from "./db.js";

const STEAM = "https://api.steampowered.com";
const FACEIT = "https://open.faceit.com/data/v4";
const LEETIFY = "https://api-public.cs-prod.leetify.com";
const TIMEOUT_MS = 8000;

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}

// ---------- Steam ----------
export async function resolveSteamId64(steamUrl) {
  const u = new URL(steamUrl);
  const [, kind, value] = u.pathname.split("/");
  if (kind === "profiles" && /^\d{17}$/.test(value)) return value;
  if (kind === "id" && value) {
    if (!process.env.STEAM_API_KEY) return null;
    const j = await getJson(`${STEAM}/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(value)}`);
    return j?.response?.success === 1 ? j.response.steamid : null;
  }
  return null;
}

export async function fetchSteam(steamId64) {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;
  const q = `key=${key}&steamids=${steamId64}`;
  const [summ, bans, level, games] = await Promise.all([
    getJson(`${STEAM}/ISteamUser/GetPlayerSummaries/v2/?${q}`),
    getJson(`${STEAM}/ISteamUser/GetPlayerBans/v1/?${q}`),
    getJson(`${STEAM}/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${steamId64}`).catch(() => null),
    getJson(`${STEAM}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId64}&appids_filter%5B0%5D=730`).catch(() => null)
  ]);
  const p = summ?.response?.players?.[0];
  const b = bans?.players?.[0];
  if (!p || !b) throw new Error("Steam profile not found");
  const cs2 = games?.response?.games?.find(g => g.appid === 730);
  return {
    steam_visibility: p.communityvisibilitystate ?? null,
    steam_created_at: p.timecreated ? p.timecreated * 1000 : null,   // only present on public profiles
    steam_level: level?.response?.player_level ?? null,
    cs2_minutes: cs2 ? cs2.playtime_forever : null,                    // null = hidden game details
    vac_bans: b.NumberOfVACBans ?? 0,
    game_bans: b.NumberOfGameBans ?? 0,
    days_since_last_ban: (b.NumberOfVACBans || b.NumberOfGameBans) ? b.DaysSinceLastBan : null,
    community_banned: b.CommunityBanned ? 1 : 0
  };
}

/** Public Steam display name, used only to suggest a username at first sign-in. Never throws. */
export async function steamPersonaName(steamId64) {
  if (!process.env.STEAM_API_KEY) return null;
  try {
    const j = await getJson(`${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId64}`);
    return j?.response?.players?.[0]?.personaname || null;
  } catch { return null; }
}

// ---------- FACEIT (live, not stored) ----------
const faceitCache = new Map();   // steamId -> { at, data } ; in memory only, cleared on restart
export const faceitEnabled = () => !!process.env.FACEIT_API_KEY;
export async function faceitProfile(steamId64) {
  const key = process.env.FACEIT_API_KEY;
  if (!key) return null;
  const hit = faceitCache.get(steamId64);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const h = { Authorization: `Bearer ${key}` };
  const player = await getJson(`${FACEIT}/players?game=cs2&game_player_id=${steamId64}`, h);
  let data = null;                                                     // null = no FACEIT account for this Steam ID
  if (player) {
    const cs2 = player.games?.cs2 || {};
    const [stats, bans] = await Promise.all([
      getJson(`${FACEIT}/players/${player.player_id}/stats/cs2`, h).catch(() => null),
      getJson(`${FACEIT}/players/${player.player_id}/bans?limit=20`, h).catch(() => null)
    ]);
    const now = Date.now();
    data = {
      nickname: player.nickname,
      level: cs2.skill_level ?? null,
      elo: cs2.faceit_elo ?? null,
      matches: stats?.lifetime?.Matches != null ? Number(stats.lifetime.Matches) : null,
      member_since: player.activated_at || null,
      bans: (bans?.items || []).map(b => ({ reason: b.reason || b.type || "Ban", starts_at: b.starts_at || null, ends_at: b.ends_at || null,
        active: !b.ends_at || Date.parse(b.ends_at) > now })),
      url: `https://www.faceit.com/en/players/${encodeURIComponent(player.nickname)}`
    };
  }
  faceitCache.set(steamId64, { at: Date.now(), data });
  if (faceitCache.size > 2000) faceitCache.delete(faceitCache.keys().next().value);
  return data;
}

// ---------- Refresh + store ----------
const STEAM_COLS = ["steam_visibility","steam_created_at","steam_level","cs2_minutes","vac_bans","game_bans","days_since_last_ban","community_banned"];

/** Fetch Steam data for a player and store it (FACEIT is live-only, see faceitProfile). Never throws; errors are recorded per source. */
export async function refreshExternal(playerId) {
  const player = db.prepare("SELECT id, steam_url, steam_id FROM players WHERE id=?").get(playerId);
  if (!player) return null;
  db.prepare("INSERT OR IGNORE INTO player_external(player_id) VALUES(?)").run(playerId);
  const now = Date.now();

  let steamId = player.steam_id;
  try {
    if (!steamId) {
      steamId = await resolveSteamId64(player.steam_url);
      if (steamId) db.prepare("UPDATE players SET steam_id=? WHERE id=?").run(steamId, playerId);
    }
    db.prepare("UPDATE player_external SET steam_id64=? WHERE player_id=?").run(steamId, playerId);
  } catch (e) { db.prepare("UPDATE player_external SET steam_error=? WHERE player_id=?").run(e.message, playerId); }
  if (!steamId) return db.prepare("SELECT * FROM player_external WHERE player_id=?").get(playerId);

  try {
    const s = await fetchSteam(steamId);
    if (s) db.prepare(`UPDATE player_external SET ${STEAM_COLS.map(c => `${c}=@${c}`).join(",")}, steam_fetched_at=@now, steam_error=NULL WHERE player_id=@pid`).run({ ...s, now, pid: playerId });
  } catch (e) { db.prepare("UPDATE player_external SET steam_error=?, steam_fetched_at=? WHERE player_id=?").run(e.message, now, playerId); }


  return db.prepare("SELECT * FROM player_external WHERE player_id=?").get(playerId);
}

// ---------- Leetify (live, not stored) ----------
const leetifyCache = new Map();   // steamId -> { at, data } ; short-lived to respect rate limits
export async function leetifyProfile(steamId64) {
  const hit = leetifyCache.get(steamId64);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const headers = process.env.LEETIFY_API_KEY ? { _leetify_key: process.env.LEETIFY_API_KEY } : {};
  const p = await getJson(`${LEETIFY}/v3/profile?steam64_id=${steamId64}`, headers);
  const data = p && p.privacy_mode !== "private" ? {
    name: p.name,
    leetify_rating: p.ranks?.leetify ?? null,
    premier: p.ranks?.premier ?? null,
    faceit_level: p.ranks?.faceit ?? null,
    faceit_elo: p.ranks?.faceit_elo ?? null,
    aim: p.rating?.aim ?? null,
    positioning: p.rating?.positioning ?? null,
    utility: p.rating?.utility ?? null,
    total_matches: p.total_matches ?? null,
    winrate: p.winrate ?? null,
    url: `https://leetify.com/app/profile/${steamId64}`
  } : null;
  leetifyCache.set(steamId64, { at: Date.now(), data });
  if (leetifyCache.size > 2000) leetifyCache.delete(leetifyCache.keys().next().value);
  return data;
}
