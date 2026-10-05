/**
 * Who may play on STACK5. New/throwaway accounts are the main cheater vector, so a player
 * needs verifiable Steam history before they can create, join or queue a team.
 *
 * Requirements (configurable via env):
 *   - Steam profile and game details public (so we can verify)
 *   - Steam account >= ELIGIBILITY_MIN_STEAM_DAYS old (default 730 = 2 years)
 *   - >= ELIGIBILITY_MIN_CS2_HOURS of CS2 playtime (default 500)
 *   - no VAC/game ban in the last 2 years, no Steam community ban
 * An admin can approve (or block) a player manually via eligibility_override.
 * Set STACK5_ELIGIBILITY=off to disable the gate (local development/tests).
 */
import { db } from "./db.js";

const DAY = 86_400_000;
export const eligibilityEnabled = () => process.env.STACK5_ELIGIBILITY !== "off";
const MIN_DAYS = () => Number(process.env.ELIGIBILITY_MIN_STEAM_DAYS || 730);
const MIN_HOURS = () => Number(process.env.ELIGIBILITY_MIN_CS2_HOURS || 500);

/** Returns { eligible, checks:[{key,label,ok,detail}], override } and stores it on the player. */
export function evaluateEligibility(playerId, now = Date.now()) {
  const p = db.prepare("SELECT id, eligibility_override, steam_verified FROM players WHERE id=?").get(playerId);
  if (!p) return null;
  const e = db.prepare("SELECT * FROM player_external WHERE player_id=?").get(playerId);
  const haveSteam = !!(e && e.steam_fetched_at && !e.steam_error);
  const checks = [];

  checks.push({ key: "steam_owner", label: "Steam account verified as yours", ok: p.steam_verified === 1,
    detail: p.steam_verified === 1 ? "Signed in through Steam" : "Sign in through Steam to prove this account is yours" });

  const years = d => (d / 365).toFixed(d >= 365 ? 1 : 2).replace(/\.0$/, "");
  checks.push({ key: "steam_found", label: "Steam profile found", ok: haveSteam,
    detail: haveSteam ? "Linked" : (e?.steam_error || (e && !e.steam_id64 ? "We couldn't find this Steam profile" : "Not checked yet")) });
  const isPublic = haveSteam && e.steam_visibility === 3;
  checks.push({ key: "public", label: "Steam profile is public", ok: isPublic,
    detail: isPublic ? "Public" : "Set Steam → Edit Profile → Privacy Settings → My profile: Public" });

  const ageDays = haveSteam && e.steam_created_at ? (now - e.steam_created_at) / DAY : null;
  checks.push({ key: "age", label: `Steam account at least ${years(MIN_DAYS())} years old`, ok: ageDays != null && ageDays >= MIN_DAYS(),
    detail: ageDays == null ? "Account age hidden (profile must be public)" : `${years(Math.floor(ageDays))} year${years(Math.floor(ageDays)) === "1" ? "" : "s"} old` });

  const hours = haveSteam && e.cs2_minutes != null ? Math.floor(e.cs2_minutes / 60) : null;
  checks.push({ key: "hours", label: `At least ${MIN_HOURS()} hours of CS2`, ok: hours != null && hours >= MIN_HOURS(),
    detail: hours == null ? "Playtime hidden. Set Privacy Settings → Game details: Public" : `${hours} hours` });

  const bans = haveSteam ? (e.vac_bans || 0) + (e.game_bans || 0) : 0;
  const recentBan = bans > 0 && e.days_since_last_ban != null && e.days_since_last_ban < 730;
  const cleanOk = haveSteam && !recentBan && !e.community_banned;
  checks.push({ key: "bans", label: "No VAC/game ban in the last 2 years", ok: cleanOk,
    detail: !haveSteam ? "Not checked yet" : recentBan ? `Ban ${e.days_since_last_ban} days ago` : e.community_banned ? "Steam community ban" : bans ? "Old ban only" : "Clean" });

  const auto = checks.every(c => c.ok);
  const eligible = p.eligibility_override === 1 ? true : p.eligibility_override === 0 ? false : auto;
  const result = { eligible, auto, override: p.eligibility_override, checks, checked_at: now };
  db.prepare("UPDATE players SET eligible=?, eligibility=?, eligibility_checked_at=? WHERE id=?")
    .run(eligible ? 1 : 0, JSON.stringify(result), now, playerId);
  return result;
}

export function isEligible(playerId) {
  if (!eligibilityEnabled()) return true;
  return db.prepare("SELECT eligible FROM players WHERE id=?").get(playerId)?.eligible === 1;
}

export const NOT_ELIGIBLE = "Your account doesn't meet the STACK5 requirements yet. See the checklist on the Play page.";
