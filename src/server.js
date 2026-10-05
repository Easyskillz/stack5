import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { db, getTeam, getTeamMembers } from "./db.js";
import { steamPersonaName, refreshExternal, leetifyProfile, faceitProfile, faceitEnabled, syncPremierFromLeetify } from "./external.js";
import { computeTrust, recomputeAll, recordEvent } from "./trust.js";
import { evaluateEligibility, isEligible, eligibilityEnabled, NOT_ELIGIBLE } from "./eligibility.js";
import { steamLoginUrl, verifySteamAssertion } from "./steam-auth.js";
import { expireStale, touchTeam, teamExpiresAt, queueExpiresAt, matchExpiresAt, LIMITS } from "./timers.js";
import { runMatchmaking } from "./matchmaking.js";
import { resultDeadline, cleanLobbyCode, cleanVoiceLink, submitReport, finishMatch, parseScore } from "./matches.js";
import { REGION_CATALOG, COUNTRY_CATALOG, parseLanguages } from "./regions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = process.env.NODE_ENV === "production";
const SESSION_DAYS = 30;
const VERIFY_HOURS = 24;
const BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Behind nginx: trust one proxy hop so req.ip is the real client IP, not 127.0.0.1.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(morgan("combined"));
app.use(express.static(path.join(__dirname, "../public"), { index: false }));

const attempts = new Map();
function rateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const hit = attempts.get(key) || { count: 0, at: now };
  if (now - hit.at > 60_000) { hit.count = 0; hit.at = now; }
  hit.count++;
  attempts.set(key, hit);
  if (hit.count > 40) return res.status(429).json({ error: "Too many requests. Try again shortly." });
  next();
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, hit] of attempts) if (hit.at < cutoff) attempts.delete(key);
}, 5 * 60_000).unref();
app.use("/api", rateLimit);
app.use("/auth", rateLimit);

function requireBody(req, res, fields) {
  for (const f of fields) {
    if (req.body?.[f] === undefined || req.body?.[f] === "") {
      res.status(400).json({ error: `${f} is required` });
      return false;
    }
  }
  return true;
}

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString("hex"); }
function safeAvatarUrl(value) {
  if (!value) return null;
  try { const u = new URL(String(value)); return u.protocol === "https:" ? u.toString().slice(0, 500) : null; } catch { return null; }
}
function emailValid(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function cookieOptions(maxAge) { return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${isProduction ? "; Secure" : ""}`; }
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return null;
}

async function sendVerificationEmail(account, rawToken) {
  const url = `${BASE_URL}/verify-email?token=${rawToken}`;
  if (!process.env.SMTP_HOST) {
    console.log(`[STACK5 DEV] Email verification link for ${account.email}: ${url}`);
    if (isProduction) throw new Error("Email delivery is not configured yet. Set SMTP_HOST/SMTP_USER/SMTP_PASS and restart CleanLobby.");
    return url;
  }
  await mailTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: account.email, subject: "Verify your CleanLobby account", text: `Verify your CleanLobby account: ${url}` });
  return null;
}
function mailTransport() {
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE) === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "contact@cleanlobby.com";

async function createSession(accountId, res) {
  const raw = randomToken(32), csrf = randomToken(24);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare("INSERT INTO sessions(account_id,token_hash,csrf_token,expires_at) VALUES(?,?,?,?)").run(accountId, hash(raw), csrf, expires);
  res.append("Set-Cookie", `stack5_session=${encodeURIComponent(raw)}; ${cookieOptions(SESSION_DAYS * 86400)}`);
  return csrf;
}

function sessionAccount(req) {
  const raw = getCookie(req, "stack5_session");
  if (!raw) return null;
  const session = db.prepare(`SELECT s.*, a.username, a.email, a.email_verified, a.is_admin, a.player_id, a.verified_steam_id, a.last_seen_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?`).get(hash(raw));
  return session && session.expires_at >= Date.now() ? session : null;
}

function auth(req, res, next) {
  if (!getCookie(req, "stack5_session")) return res.status(401).json({ error: "Authentication required" });
  const session = sessionAccount(req);
  if (!session) return res.status(401).json({ error: "Session expired. Please log in again." });
  req.account = session;
  // Counts players online (aggregate only); written at most once a minute per account.
  if (!session.last_seen_at || Date.now() - session.last_seen_at > 60_000) db.prepare("UPDATE accounts SET last_seen_at=? WHERE id=?").run(Date.now(), session.account_id);
  next();
}
function csrf(req, res, next) {
  const raw = getCookie(req, "stack5_session");
  const token = req.headers["x-csrf-token"];
  const session = raw && db.prepare("SELECT csrf_token FROM sessions WHERE token_hash=?").get(hash(raw));
  if (!session || !token || token !== session.csrf_token) return res.status(403).json({ error: "Invalid CSRF token" });
  next();
}
function adminRequired(req, res, next) {
  if (!req.account || !req.account.is_admin) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

function profileRequired(req, res, next) {
  if (!req.account.player_id) return res.status(403).json({ error: "Complete your player profile first", code: "PROFILE_INCOMPLETE" });
  next();
}

// Creating, joining and queueing teams requires verified Steam history (see eligibility.js).
function eligibleRequired(req, res, next) {
  if (!isEligible(req.account.player_id)) return res.status(403).json({ error: NOT_ELIGIBLE, code: "NOT_ELIGIBLE" });
  next();
}

app.get("/api/admin/me", auth, adminRequired, (req, res) => {
  res.json({
    id: req.account.account_id,
    username: req.account.username,
    email: req.account.email,
    email_verified: !!req.account.email_verified,
    is_admin: !!req.account.is_admin,
    csrf_token: req.account.csrf_token
  });
});

app.get("/admin", auth, adminRequired, (req, res) => {
  res.sendFile(path.join(__dirname, "../admin.html"));
});

app.get("/api/admin/stats", auth, adminRequired, (req, res) => {
  const count = (sql, ...args) => db.prepare(sql).get(...args).count;
  res.json({
    accounts: count("SELECT COUNT(*) AS count FROM accounts"),
    verifiedAccounts: count("SELECT COUNT(*) AS count FROM accounts WHERE verified_steam_id IS NOT NULL"),
    admins: count("SELECT COUNT(*) AS count FROM accounts WHERE is_admin=1"),
    players: count("SELECT COUNT(*) AS count FROM players"),
    teams: count("SELECT COUNT(*) AS count FROM teams"),
    openTeams: count("SELECT COUNT(*) AS count FROM teams WHERE status='OPEN'"),
    readyTeams: count("SELECT COUNT(*) AS count FROM teams WHERE status='READY'"),
    queuedTeams: count("SELECT COUNT(*) AS count FROM queue"),
    matches: count("SELECT COUNT(*) AS count FROM matches"),
    confirmedMatches: count("SELECT COUNT(*) AS count FROM matches WHERE status='COMPLETED'")
  });
});

app.get("/api/admin/accounts", auth, adminRequired, (req, res) => {
  res.json(db.prepare(`SELECT a.id,a.username,a.email,a.email_verified,a.is_admin,a.player_id,a.created_at,
    p.display_name,p.country,p.region,p.premier_rating
    FROM accounts a LEFT JOIN players p ON p.id=a.player_id ORDER BY a.id DESC`).all());
});

app.get("/api/admin/players", auth, adminRequired, (req, res) => {
  res.json(db.prepare(`SELECT p.*, a.username, a.email, a.email_verified
    FROM players p LEFT JOIN accounts a ON a.player_id=p.id ORDER BY p.id DESC`).all());
});

app.get("/api/admin/teams", auth, adminRequired, (req, res) => {
  const teams = db.prepare(`SELECT t.*, p.display_name AS captain_name,
    (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) AS member_count,
    (SELECT COUNT(*) FROM queue q WHERE q.team_id=t.id) AS queued
    FROM teams t JOIN players p ON p.id=t.captain_id ORDER BY t.id DESC`).all();
  res.json(teams);
});

app.get("/api/admin/queue", auth, adminRequired, (req, res) => {
  res.json(db.prepare(`SELECT q.queued_at,t.id,t.name,t.region,t.status,p.display_name AS captain_name,
    (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) AS member_count
    FROM queue q JOIN teams t ON t.id=q.team_id JOIN players p ON p.id=t.captain_id
    ORDER BY q.queued_at ASC`).all());
});

app.get("/api/admin/matches", auth, adminRequired, (req, res) => {
  res.json(db.prepare(`SELECT m.*,a.name AS team_a_name,b.name AS team_b_name
    FROM matches m JOIN teams a ON a.id=m.team_a_id JOIN teams b ON b.id=m.team_b_id
    ORDER BY m.id DESC`).all());
});

app.post("/api/admin/run-matchmaking", auth, adminRequired, csrf, (req, res) => {
  res.json({ matches: runMatchmaking() });
});

app.get("/api/health", (_, res) => res.json({ ok: true, service: "stack5", version: "0.2.0" }));
app.get("/api/regions", (_, res) => res.json({ regions: REGION_CATALOG, countries: COUNTRY_CATALOG.map(([code,name,region,flag]) => ({ code, name, region, flag })) }));

app.get("/verify-email", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Invalid verification link.");
  const account = db.prepare("SELECT id FROM accounts WHERE verification_token_hash=? AND verification_expires_at>? AND email_verified=0").get(hash(token), Date.now());
  if (!account) return res.status(400).send("This verification link is invalid or expired.");
  db.prepare("UPDATE accounts SET email_verified=1, verification_token_hash=NULL, verification_expires_at=NULL WHERE id=?").run(account.id);
  res.redirect("/account?email=verified");
});

app.post("/api/auth/logout", auth, csrf, (req, res) => {
  const raw = getCookie(req, "stack5_session");
  db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw));
  res.setHeader("Set-Cookie", `stack5_session=; ${cookieOptions(0)}`);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  const player = req.account.player_id ? db.prepare("SELECT * FROM players WHERE id=?").get(req.account.player_id) : null;
  res.json({
    csrf_token: req.account.csrf_token, account: { id:req.account.account_id, username:req.account.username, email:req.account.email, email_verified:!!req.account.email_verified }, player });
});

// ---- "Sign in through Steam": the only way in. A first sign-in creates the account (username picked
// on /welcome); a returning player gets a session; a signed-in account without proven Steam links one.
const STEAM_RETURN_PATH = "/auth/steam/return";
const STEAM_STATE_MINUTES = 15, SIGNUP_MINUTES = 30;
const usernameTaken = name => !!db.prepare("SELECT 1 FROM accounts WHERE lower(username)=lower(?)").get(name);

app.get("/auth/steam/start", (req, res) => {
  const account = sessionAccount(req);
  if (account?.verified_steam_id) return res.redirect("/play");
  const state = randomToken(16);
  db.prepare("DELETE FROM steam_auth_states WHERE created_at < ?").run(Date.now() - STEAM_STATE_MINUTES * 60_000);
  db.prepare("INSERT INTO steam_auth_states(state,account_id,created_at) VALUES(?,?,?)").run(state, account?.account_id ?? null, Date.now());
  // Tie the attempt to this browser, so a sign-in link can't log someone else in.
  res.append("Set-Cookie", `stack5_steam_state=${state}; ${cookieOptions(STEAM_STATE_MINUTES * 60)}`);
  res.redirect(steamLoginUrl(`${BASE_URL}${STEAM_RETURN_PATH}?state=${state}`, BASE_URL));
});

app.get(STEAM_RETURN_PATH, async (req, res) => {
  const params = new URL(req.originalUrl, BASE_URL).searchParams;
  const state = params.get("state") || "";
  const row = db.prepare("SELECT * FROM steam_auth_states WHERE state=?").get(state);
  db.prepare("DELETE FROM steam_auth_states WHERE state=?").run(state);
  res.append("Set-Cookie", `stack5_steam_state=; ${cookieOptions(0)}`);
  const fail = msg => res.redirect(`/login?error=${encodeURIComponent(msg)}`);
  if (!row || getCookie(req, "stack5_steam_state") !== state || Date.now() - row.created_at > STEAM_STATE_MINUTES * 60_000) return fail("Steam sign-in expired. Please try again.");
  try {
    const steamId = await verifySteamAssertion(params, `${BASE_URL}${STEAM_RETURN_PATH}?state=${state}`);
    const owner = db.prepare("SELECT id FROM accounts WHERE verified_steam_id=?").get(steamId);

    if (row.account_id) {                       // linking from a signed-in (older) account
      const account = sessionAccount(req);
      if (account?.account_id !== row.account_id) return fail("Steam sign-in expired. Please try again.");
      if (owner && owner.id !== account.account_id) return fail("This Steam account already has a CleanLobby account. Log out and sign in with it instead.");
      await linkVerifiedSteam(account, steamId);
      return res.redirect("/play?steam=linked");
    }

    let accountId = owner?.id;
    if (!accountId) {
      // An older account that pasted this Steam profile: signing in proves it, so the account becomes theirs.
      const legacy = db.prepare(`SELECT a.id, a.player_id FROM accounts a JOIN players p ON p.id=a.player_id
        WHERE p.steam_id=? AND p.deleted_at IS NULL AND a.verified_steam_id IS NULL`).get(steamId);
      if (legacy) {
        db.prepare("DELETE FROM sessions WHERE account_id=?").run(legacy.id);   // sign out anyone who used it before
        await linkVerifiedSteam({ account_id: legacy.id, player_id: legacy.player_id }, steamId);
        accountId = legacy.id;
      }
    }
    if (accountId) { await createSession(accountId, res); return res.redirect("/play"); }

    const token = randomToken(32);
    db.prepare("DELETE FROM steam_signups WHERE created_at < ?").run(Date.now() - SIGNUP_MINUTES * 60_000);
    db.prepare("INSERT INTO steam_signups(token_hash,steam_id,created_at) VALUES(?,?,?)").run(hash(token), steamId, Date.now());
    res.append("Set-Cookie", `stack5_signup=${token}; ${cookieOptions(SIGNUP_MINUTES * 60)}`);
    res.redirect("/welcome");
  } catch (e) { fail(e.message); }
});

function pendingSignup(req) {
  const token = getCookie(req, "stack5_signup");
  const row = token && db.prepare("SELECT * FROM steam_signups WHERE token_hash=?").get(hash(token));
  return row && Date.now() - row.created_at <= SIGNUP_MINUTES * 60_000 ? row : null;
}
const SIGNUP_EXPIRED = "Your Steam sign-in expired. Please sign in again.";

app.get("/welcome", (req, res) => pendingSignup(req) ? res.sendFile(path.join(__dirname, "../public/pages/welcome.html")) : res.redirect("/login"));

app.get("/api/auth/signup", async (req, res) => {
  const s = pendingSignup(req);
  if (!s) return res.status(401).json({ error: SIGNUP_EXPIRED });
  const persona = await steamPersonaName(s.steam_id);
  const suggestion = String(persona || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24);
  res.json({ steam_id: s.steam_id, persona, suggested_username: suggestion.length >= 3 && !usernameTaken(suggestion) ? suggestion : "" });
});

app.post("/api/auth/signup", async (req, res) => {
  const s = pendingSignup(req);
  if (!s) return res.status(401).json({ error: SIGNUP_EXPIRED });
  if (!requireBody(req, res, ["username", "terms"])) return;
  const username = String(req.body.username).trim();
  const email = String(req.body.email || "").trim().toLowerCase() || null;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "Username must be 3–24 characters using letters, numbers or underscore." });
  if (email && !emailValid(email)) return res.status(400).json({ error: "Enter a valid email address, or leave it empty." });
  if (!(req.body.terms === true || req.body.terms === "true" || req.body.terms === "on")) return res.status(400).json({ error: "You must accept the CleanLobby terms." });
  if (usernameTaken(username)) return res.status(409).json({ error: "That username is taken." });
  if (email && db.prepare("SELECT 1 FROM accounts WHERE lower(email)=?").get(email)) return res.status(409).json({ error: "That email is already used by another account." });
  if (db.prepare("SELECT 1 FROM accounts WHERE verified_steam_id=?").get(s.steam_id) ||
      db.prepare("SELECT 1 FROM players WHERE steam_id=? AND steam_verified=1 AND deleted_at IS NULL").get(s.steam_id))
    return res.status(409).json({ error: "This Steam account already has a CleanLobby account. Sign in again to use it." });
  const token = email ? randomToken(32) : null;
  const id = db.prepare(`INSERT INTO accounts(username,email,email_verified,verification_token_hash,verification_expires_at,terms_accepted_at)
    VALUES(?,?,0,?,?,CURRENT_TIMESTAMP)`).run(username, email, token && hash(token), token && Date.now() + VERIFY_HOURS * 3600000).lastInsertRowid;
  db.prepare("DELETE FROM steam_signups WHERE token_hash=?").run(s.token_hash);
  await linkVerifiedSteam({ account_id: id, player_id: null }, s.steam_id);
  res.append("Set-Cookie", `stack5_signup=; ${cookieOptions(0)}`);
  const csrfToken = await createSession(id, res);
  if (email) sendVerificationEmail({ email }, token).catch(e => console.error("[STACK5] verification email failed:", e.message));
  res.status(201).json({ ok: true, csrf_token: csrfToken });
});

/**
 * Attach a proven SteamID to an account. If another CleanLobby player had claimed this Steam account
 * by pasting its URL (without proof), the verified owner wins and that claim is removed.
 */
async function linkVerifiedSteam(account, steamId) {
  const now = Date.now();
  const claimant = db.prepare("SELECT id, steam_verified FROM players WHERE steam_id=? AND deleted_at IS NULL AND id IS NOT ?").get(steamId, account.player_id ?? null);
  if (claimant?.steam_verified) throw new Error("This Steam account is already verified by another CleanLobby player.");
  db.transaction(() => {
    if (claimant) {
      db.prepare("UPDATE players SET steam_id=NULL, steam_url=?, steam_verified=0 WHERE id=?").run(`unlinked:${claimant.id}`, claimant.id);
      db.prepare("DELETE FROM player_external WHERE player_id=?").run(claimant.id);
    }
    db.prepare("UPDATE accounts SET verified_steam_id=? WHERE id=?").run(steamId, account.account_id);
    if (account.player_id) {
      db.prepare("UPDATE players SET steam_id=?, steam_url=?, steam_verified=1, steam_verified_at=? WHERE id=?")
        .run(steamId, `https://steamcommunity.com/profiles/${steamId}`, now, account.player_id);
      db.prepare("DELETE FROM player_external WHERE player_id=?").run(account.player_id);   // re-pull for the proven account
    }
  })();
  for (const pid of [account.player_id, claimant?.id].filter(Boolean)) {
    await refreshExternal(pid).catch(() => {});
    computeTrust(pid); evaluateEligibility(pid);
  }
}

app.post("/api/profile", auth, csrf, async (req, res) => {
  if (!requireBody(req, res, ["country","region","role"])) return;
  const languages = parseLanguages(req.body.languages ?? req.body.language);
  if (!languages.length) return res.status(400).json({ error: "Pick at least one language you speak." });
  // Premier rating is optional at sign-up: left empty, it's copied from Leetify right after.
  const typed = String(req.body.premier_rating ?? "").trim() !== "";
  const premier = typed ? premierRating(req.body.premier_rating) : null;
  if (typed && premier === null) return res.status(400).json({ error: PREMIER_ERROR });
  if (!req.account.verified_steam_id) return res.status(403).json({ error: "Sign in through Steam first to prove the account is yours.", code: "STEAM_NOT_LINKED" });
  const country = COUNTRY_CATALOG.find(x => x[0] === req.body.country);
  const region = REGION_CATALOG.find(x => x.id === req.body.region);
  if (!country || !region) return res.status(400).json({ error: "Invalid country or region." });
  if (country[2] !== region.id) return res.status(400).json({ error: "Country and matchmaking region do not match." });
  if (req.account.player_id) return res.status(409).json({ error: "Your player profile already exists." });
  try {
    // Ownership already proven by Steam sign-in.
    const steamId = req.account.verified_steam_id;
    const steamUrl = `https://steamcommunity.com/profiles/${steamId}`;
    const name = String(req.body.display_name || req.account.username).slice(0,40);
    const result = db.transaction(() => {
      const existing = db.prepare("SELECT id FROM players WHERE steam_url=? OR (steam_id IS NOT NULL AND steam_id=?)").get(steamUrl, steamId);
      if (existing) throw new Error("This Steam profile is already linked to a CleanLobby player.");
      const r = db.prepare(`INSERT INTO players(steam_url,steam_id,steam_verified,steam_verified_at,display_name,avatar_url,premier_rating,premier_source,region,country,language,languages,role) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(steamUrl,steamId,1,Date.now(),name,safeAvatarUrl(req.body.avatar_url),premier,typed?"self":null,region.id,country[0],languages[0],languages.join(","),String(req.body.role).slice(0,20));
      db.prepare("UPDATE accounts SET player_id=? WHERE id=?").run(r.lastInsertRowid, req.account.account_id);
      return r.lastInsertRowid;
    })();
    if (!typed) await syncPremierFromLeetify(result).catch(e => console.error("[STACK5] Premier from Leetify failed:", e.message));
    computeTrust(result);
    evaluateEligibility(result);
    // Pull Steam/FACEIT data in the background, then rescore and re-check eligibility.
    refreshExternal(result).then(() => { computeTrust(result); evaluateEligibility(result); }).catch(e => console.error("[STACK5] external refresh failed:", e.message));
    res.status(201).json({ player: db.prepare("SELECT * FROM players WHERE id=?").get(result) });
  } catch(e) { res.status(400).json({ error:e.message }); }
});

// Premier rating: whole number 0-40000, 0 = no rating yet (Premier needs 10 wins first). Self-reported:
// Leetify's live panel shows the real one, but their terms don't allow storing it or using it to match.
const PREMIER_ERROR = "Enter your CS2 Premier rating (0 to 40,000), or 0 if you don't have one yet.";
function premierRating(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[ ,.]/g, ""));
  return Number.isInteger(n) && n >= 0 && n <= 40000 ? n : null;
}
app.post("/api/profile/premier", auth, csrf, profileRequired, async (req, res) => {
  if (req.body.use_leetify) {   // go back to the Leetify copy
    db.prepare("UPDATE players SET premier_source=NULL, premier_rating=NULL WHERE id=?").run(req.account.player_id);
    const r = await syncPremierFromLeetify(req.account.player_id).catch(() => null);
    return res.json({ premier_rating: r, message: r ? `Premier rating from Leetify: ${r.toLocaleString("en-US")}.` : "Leetify has no Premier rating for you. Enter it yourself." });
  }
  const premier = premierRating(req.body.premier_rating);
  if (premier === null) return res.status(400).json({ error: PREMIER_ERROR });
  db.prepare("UPDATE players SET premier_rating=?, premier_source='self' WHERE id=?").run(premier, req.account.player_id);
  res.json({ premier_rating: premier, message: premier ? `Premier rating saved: ${premier.toLocaleString("en-US")}.` : "Saved: no Premier rating yet." });
});

app.post("/api/profile/languages", auth, csrf, profileRequired, (req, res) => {
  const languages = parseLanguages(req.body.languages);
  if (!languages.length) return res.status(400).json({ error: "Pick at least one language you speak." });
  db.prepare("UPDATE players SET language=?, languages=? WHERE id=?").run(languages[0], languages.join(","), req.account.player_id);
  res.json({ languages, message: "Languages saved." });
});

const PUBLIC_PLAYER_COLS = "id,steam_url,steam_verified,display_name,avatar_url,premier_rating,premier_source,region,country,language,languages,role,trust_score,reliability_score,teamplay_score,trust_confidence";
app.get("/api/players", (_, res) => res.json(db.prepare(`SELECT ${PUBLIC_PLAYER_COLS},eligible FROM players WHERE deleted_at IS NULL ORDER BY id DESC`).all()));
app.get("/api/players/:id", (req,res) => { const p=db.prepare(`SELECT ${PUBLIC_PLAYER_COLS},eligible,created_at FROM players WHERE id=? AND deleted_at IS NULL`).get(req.params.id); if(!p) return res.status(404).json({error:"Player not found"}); res.json(p); });

// Trust breakdown shown on profiles (why the score is what it is).
app.get("/api/players/:id/trust", (req,res) => {
  const p=db.prepare("SELECT id,trust_breakdown,trust_updated_at FROM players WHERE id=?").get(req.params.id);
  if(!p) return res.status(404).json({error:"Player not found"});
  res.json(p.trust_breakdown ? JSON.parse(p.trust_breakdown) : computeTrust(p.id));
});

// Live Leetify stats (proxied, not stored, per Leetify's developer guidelines).
app.get("/api/players/:id/leetify", async (req,res) => {
  const p=db.prepare("SELECT steam_id FROM players WHERE id=?").get(req.params.id);
  if(!p) return res.status(404).json({error:"Player not found"});
  if(!p.steam_id) return res.json({ available:false });
  try { const data=await leetifyProfile(p.steam_id); res.json(data ? { available:true, ...data } : { available:false }); }
  catch { res.json({ available:false }); }
});

// Live FACEIT profile (proxied, not stored, per FACEIT's API terms).
app.get("/api/players/:id/faceit", async (req,res) => {
  const p=db.prepare("SELECT steam_id FROM players WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if(!p) return res.status(404).json({error:"Player not found"});
  if(!faceitEnabled() || !p.steam_id) return res.json({ available:false });
  try { const data=await faceitProfile(p.steam_id); res.json(data ? { available:true, ...data } : { available:true, none:true }); }
  catch { res.json({ available:false }); }
});

function activeTeamForPlayer(playerId) {
  return db.prepare(`SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id=t.id
    WHERE tm.player_id=? AND t.status NOT IN ('FINISHED','CANCELLED') ORDER BY t.id DESC LIMIT 1`).get(playerId);
}

app.get("/api/my/teams", auth, profileRequired, (req,res) => {
  res.json(db.prepare(`SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.player_id=? ORDER BY t.id DESC`).all(req.account.player_id).map(t => getTeam(t.id)));
});

app.get("/api/team-invites", auth, profileRequired, (req,res) => {
  res.json(db.prepare(`SELECT i.*,t.name AS team_name,t.region,p.display_name AS invited_by
    FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN players p ON p.id=i.invited_by_player_id
    WHERE i.invited_player_id=? AND i.status='PENDING' ORDER BY i.id DESC`).all(req.account.player_id));
});

app.post("/api/teams", auth, csrf, profileRequired, eligibleRequired, (req,res) => {
  if (!requireBody(req,res,["name"])) return;
  if (activeTeamForPlayer(req.account.player_id)) return res.status(409).json({error:"You are already in an active team."});
  const captain=db.prepare("SELECT * FROM players WHERE id=?").get(req.account.player_id);
  if(!captain) return res.status(404).json({error:"Player not found"});
  const region=req.body.region || captain.region;
  if (!REGION_CATALOG.some(r=>r.id===region)) return res.status(400).json({error:"Invalid region"});
  const min=Math.max(0,Math.min(40000,Math.round(Number(req.body.min_rating)||0)));
  const max=Math.max(min,Math.min(40000,Math.round(Number(req.body.max_rating)||40000)));
  const name=String(req.body.name).trim().slice(0,40);
  if(name.length<2) return res.status(400).json({error:"Team name must be at least 2 characters."});
  const result=db.prepare("INSERT INTO teams(name,captain_id,region,min_rating,max_rating,scheduled_at,last_activity_at) VALUES(?,?,?,?,?,?,?)").run(name,captain.id,region,min,max,req.body.scheduled_at||null,Date.now());
  db.prepare("INSERT INTO team_members(team_id,player_id) VALUES(?,?)").run(result.lastInsertRowid,captain.id);
  res.status(201).json(getTeam(result.lastInsertRowid));
});

app.get("/api/teams/:id", (req,res)=>{const team=getTeam(req.params.id);if(!team)return res.status(404).json({error:"Team not found"});res.json(team);});

app.post("/api/teams/:id/invite", auth, csrf, profileRequired, (req,res)=>{
  if(!req.body?.username && !req.body?.player_id) return res.status(400).json({error:"username or player_id is required"});
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can invite players."});
  if(team.count>=5) return res.status(409).json({error:"Team is already full."});
  if(team.status!=="OPEN") return res.status(409).json({error:"Team is no longer open."});
  const target=req.body.player_id
    ? db.prepare("SELECT * FROM players WHERE id=?").get(Number(req.body.player_id))
    : db.prepare("SELECT p.* FROM players p JOIN accounts a ON a.player_id=p.id WHERE lower(a.username)=lower(?)").get(String(req.body.username).trim());
  if(!target || target.deleted_at) return res.status(404).json({error:"CleanLobby player not found."});
  if(!isEligible(target.id)) return res.status(409).json({error:`${target.display_name} doesn't meet the CleanLobby requirements yet, so they can't join a team.`});
  if(target.id===req.account.player_id) return res.status(400).json({error:"You cannot invite yourself."});
  if(team.members.some(x=>x.id===target.id)) return res.status(409).json({error:"That player is already in the team."});
  if(activeTeamForPlayer(target.id)) return res.status(409).json({error:"That player is already in an active team."});
  const existing=db.prepare("SELECT id FROM team_invites WHERE team_id=? AND invited_player_id=? AND status='PENDING'").get(team.id,target.id);
  if(existing) return res.status(409).json({error:"An invitation is already pending."});
  // One row per (team, player): re-inviting after a decline reopens the old invite.
  db.prepare(`INSERT INTO team_invites(team_id,invited_player_id,invited_by_player_id) VALUES(?,?,?)
    ON CONFLICT(team_id,invited_player_id) DO UPDATE SET status='PENDING',invited_by_player_id=excluded.invited_by_player_id,created_at=CURRENT_TIMESTAMP,responded_at=NULL`).run(team.id,target.id,req.account.player_id);
  res.status(201).json({ok:true,message:`Invitation sent to ${target.display_name}.`});
});

app.post("/api/team-invites/:id/accept", auth, csrf, profileRequired, eligibleRequired, (req,res)=>{
  const invite=db.prepare("SELECT * FROM team_invites WHERE id=? AND invited_player_id=? AND status='PENDING'").get(req.params.id,req.account.player_id);
  if(!invite) return res.status(404).json({error:"Invitation not found or already handled."});
  const team=getTeam(invite.team_id);
  if(!team || team.status!=="OPEN" || team.count>=5) return res.status(409).json({error:"This team is no longer accepting players."});
  if(activeTeamForPlayer(req.account.player_id)) return res.status(409).json({error:"You are already in an active team."});
  const tx=db.transaction(()=>{
    db.prepare("INSERT INTO team_members(team_id,player_id) VALUES(?,?)").run(team.id,req.account.player_id);
    touchTeam(team.id);
    db.prepare("UPDATE team_invites SET status='ACCEPTED',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(invite.id);
    db.prepare("UPDATE team_invites SET status='DECLINED',responded_at=CURRENT_TIMESTAMP WHERE invited_player_id=? AND status='PENDING' AND id<>?").run(req.account.player_id,invite.id);
    db.prepare("UPDATE team_join_requests SET status='EXPIRED',responded_at=CURRENT_TIMESTAMP WHERE player_id=? AND status='PENDING'").run(req.account.player_id);
  });
  tx(); res.json(getTeam(team.id));
});

app.post("/api/team-invites/:id/decline", auth, csrf, profileRequired, (req,res)=>{
  const r=db.prepare("UPDATE team_invites SET status='DECLINED',responded_at=CURRENT_TIMESTAMP WHERE id=? AND invited_player_id=? AND status='PENDING'").run(req.params.id,req.account.player_id);
  if(!r.changes) return res.status(404).json({error:"Invitation not found or already handled."});
  res.json({ok:true});
});

// Teams are invite-only: players join through /api/team-invites/:id/accept.
app.post("/api/teams/:id/join", auth, csrf, profileRequired, (req,res)=>res.status(403).json({error:"Teams are invite-only. Ask the captain to invite you."}));

// Roster changes are only allowed before a match is found. A READY/queued team that
// loses a player drops back to OPEN and leaves the queue.
const ROSTER_EDITABLE = ["OPEN","READY"];
function removeFromRoster(team, playerId) {
  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id=? AND player_id=?").run(team.id, playerId);
    if (team.status === "READY") {
      db.prepare("UPDATE teams SET status='OPEN' WHERE id=?").run(team.id);
      db.prepare("DELETE FROM queue WHERE team_id=?").run(team.id);
    }
  })();
}

app.post("/api/teams/:id/leave", auth, csrf, profileRequired, (req,res)=>{
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(!team.members.some(m=>m.id===req.account.player_id)) return res.status(400).json({error:"You are not in this team."});
  if(team.captain_id===req.account.player_id) return res.status(400).json({error:"Captain cannot leave; transfer captain or disband the team."});
  if(!ROSTER_EDITABLE.includes(team.status)) return res.status(409).json({error:"You cannot leave after a match has been found."});
  removeFromRoster(team, req.account.player_id);
  if (team.status === "READY") { recordEvent(req.account.player_id, "LEFT_QUEUED_TEAM", team.id); computeTrust(req.account.player_id); }
  res.json(getTeam(team.id));
});

app.post("/api/teams/:id/remove", auth, csrf, profileRequired, (req,res)=>{
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can remove players."});
  const pid=Number(req.body.player_id);
  if(pid===team.captain_id) return res.status(400).json({error:"The captain cannot be removed."});
  if(!team.members.some(m=>m.id===pid)) return res.status(404).json({error:"That player is not in the team."});
  if(!ROSTER_EDITABLE.includes(team.status)) return res.status(409).json({error:"Players cannot be removed after a match has been found."});
  removeFromRoster(team, pid);
  res.json(getTeam(team.id));
});

app.post("/api/teams/:id/transfer", auth, csrf, profileRequired, (req,res)=>{
  if(!requireBody(req,res,["player_id"])) return;
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can transfer captaincy."});
  const pid=Number(req.body.player_id);
  if(pid===team.captain_id || !team.members.some(m=>m.id===pid)) return res.status(400).json({error:"Choose another member of the team."});
  db.prepare("UPDATE teams SET captain_id=? WHERE id=?").run(pid, team.id);
  res.json(getTeam(team.id));
});

app.post("/api/teams/:id/disband", auth, csrf, profileRequired, (req,res)=>{
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can disband the team."});
  if(!ROSTER_EDITABLE.includes(team.status)) return res.status(409).json({error:"A team cannot be disbanded after a match has been found."});
  db.transaction(() => {
    db.prepare("UPDATE teams SET status='CANCELLED' WHERE id=?").run(team.id);
    db.prepare("DELETE FROM queue WHERE team_id=?").run(team.id);
    db.prepare("UPDATE team_invites SET status='CANCELLED',responded_at=CURRENT_TIMESTAMP WHERE team_id=? AND status='PENDING'").run(team.id);
  })();
  res.json({ok:true});
});
app.post("/api/teams/:id/ready", auth, csrf, profileRequired, (req,res)=>{const team=getTeam(req.params.id);if(!team)return res.status(404).json({error:"Team not found"});if(team.captain_id!==req.account.player_id)return res.status(403).json({error:"Only the captain can ready the team"});if(team.count!==5)return res.status(400).json({error:"Team must have 5 players"});db.prepare("UPDATE teams SET status='READY' WHERE id=?").run(team.id);res.json(getTeam(team.id));});
app.post("/api/teams/:id/queue", auth, csrf, profileRequired, eligibleRequired, (req,res)=>{const team=getTeam(req.params.id);if(!team)return res.status(404).json({error:"Team not found"});if(team.captain_id!==req.account.player_id)return res.status(403).json({error:"Only the captain can queue the team"});if(team.count!==5)return res.status(400).json({error:"Team must have 5 players"});const blocked=team.members.filter(m=>!isEligible(m.id));if(blocked.length)return res.status(409).json({error:`${blocked.map(m=>m.display_name).join(", ")} no longer meet${blocked.length>1?"":"s"} the CleanLobby requirements. Remove them to queue.`});if(!["OPEN","READY"].includes(team.status))return res.status(409).json({error:"Team cannot be queued right now."});db.prepare("UPDATE teams SET status='READY' WHERE id=?").run(team.id);db.prepare("INSERT OR IGNORE INTO queue(team_id) VALUES(?)").run(team.id);res.json({queued:true,team:getTeam(team.id)});});
app.get("/api/queue", (_,res)=>res.json(db.prepare(`SELECT t.id,t.name,t.region,t.min_rating,t.max_rating,COUNT(tm.player_id) count FROM queue q JOIN teams t ON t.id=q.team_id LEFT JOIN team_members tm ON tm.team_id=t.id GROUP BY t.id ORDER BY q.queued_at`).all()));
app.post("/api/matchmaking/run", auth, adminRequired, csrf, (_,res)=>res.json({matches:runMatchmaking()}));
app.get("/api/matches/:id", (req,res)=>{const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);if(!m)return res.status(404).json({error:"Match not found"});res.json({...publicMatch(m),team_a:getTeam(m.team_a_id),team_b:getTeam(m.team_b_id)});});
app.post("/api/matches/:id/accept", auth, csrf, profileRequired, (req,res)=>{if(!requireBody(req,res,["team_id"]))return;const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);if(!m)return res.status(404).json({error:"Match not found"});if(m.status!=="PENDING")return res.status(409).json({error:"This match is no longer pending."});const teamId=Number(req.body.team_id);const team=getTeam(teamId);if(!team||team.captain_id!==req.account.player_id)return res.status(403).json({error:"Only the captain of the matched team can accept"});if(teamId===m.team_a_id)db.prepare("UPDATE matches SET accepted_a=1 WHERE id=?").run(m.id);else if(teamId===m.team_b_id)db.prepare("UPDATE matches SET accepted_b=1 WHERE id=?").run(m.id);else return res.status(403).json({error:"Team is not part of this match"});const updated=db.prepare("SELECT * FROM matches WHERE id=?").get(m.id);if(updated.accepted_a&&updated.accepted_b){db.prepare("UPDATE matches SET status='CONFIRMED', confirmed_at=? WHERE id=?").run(Date.now(),m.id);db.prepare("UPDATE teams SET status='MATCH_CONFIRMED' WHERE id IN (?,?)").run(m.team_a_id,m.team_b_id);for(const p of [...getTeamMembers(m.team_a_id),...getTeamMembers(m.team_b_id)])computeTrust(p.id);}res.json(db.prepare("SELECT * FROM matches WHERE id=?").get(m.id));});

// True if both players were on either side of the same confirmed match.
function playedTogether(aId, bId) {
  return !!db.prepare(`
    SELECT 1 FROM matches m
    JOIN team_members x ON x.team_id IN (m.team_a_id, m.team_b_id) AND x.player_id=?
    JOIN team_members y ON y.team_id IN (m.team_a_id, m.team_b_id) AND y.player_id=?
    WHERE m.status='COMPLETED' LIMIT 1`).get(aId, bId);
}

app.post("/api/trust", auth, csrf, profileRequired, (req,res)=>{if(!requireBody(req,res,["to_player_id","rating"]))return;const rating=Math.max(1,Math.min(5,Math.round(Number(req.body.rating))||0));req.body.to_player_id=Number(req.body.to_player_id);if(req.body.to_player_id===req.account.player_id)return res.status(400).json({error:"You cannot rate yourself"});if(!playedTogether(req.account.player_id,req.body.to_player_id))return res.status(403).json({error:"You can rate players once a match you played together has a result."});db.prepare(`INSERT INTO trust_ratings(from_player_id,to_player_id,rating,tags) VALUES(?,?,?,?) ON CONFLICT(from_player_id,to_player_id) DO UPDATE SET rating=excluded.rating,tags=excluded.tags`).run(req.account.player_id,req.body.to_player_id,rating,req.body.tags||"");const t=computeTrust(req.body.to_player_id);res.json({ok:true,trust_score:t?.total});});


// ---- Join requests: a player asks to join an OPEN team; the captain accepts or declines.
app.post("/api/teams/:id/request-join", auth, csrf, profileRequired, eligibleRequired, (req,res)=>{
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.status!=="OPEN" || team.count>=5) return res.status(409).json({error:"This team is not accepting players."});
  if(team.members.some(m=>m.id===req.account.player_id)) return res.status(409).json({error:"You are already in this team."});
  if(activeTeamForPlayer(req.account.player_id)) return res.status(409).json({error:"Leave your current team before requesting to join another."});
  const existing=db.prepare("SELECT status FROM team_join_requests WHERE team_id=? AND player_id=?").get(team.id,req.account.player_id);
  if(existing?.status==="PENDING") return res.status(409).json({error:"Your request is already pending."});
  db.prepare(`INSERT INTO team_join_requests(team_id,player_id) VALUES(?,?)
    ON CONFLICT(team_id,player_id) DO UPDATE SET status='PENDING',created_at=CURRENT_TIMESTAMP,responded_at=NULL`).run(team.id,req.account.player_id);
  res.status(201).json({ok:true,message:`Request sent to ${team.name}.`});
});

function joinRequestForCaptain(req,res){
  const jr=db.prepare("SELECT * FROM team_join_requests WHERE id=? AND status='PENDING'").get(req.params.id);
  if(!jr){ res.status(404).json({error:"Request not found or already handled."}); return null; }
  const team=getTeam(jr.team_id);
  if(!team || team.captain_id!==req.account.player_id){ res.status(403).json({error:"Only the captain can answer join requests."}); return null; }
  return {jr,team};
}

app.post("/api/join-requests/:id/accept", auth, csrf, profileRequired, (req,res)=>{
  const found=joinRequestForCaptain(req,res); if(!found) return;
  const {jr,team}=found;
  if(team.status!=="OPEN" || team.count>=5) return res.status(409).json({error:"Your team is not accepting players."});
  if(activeTeamForPlayer(jr.player_id)) {
    db.prepare("UPDATE team_join_requests SET status='EXPIRED',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(jr.id);
    return res.status(409).json({error:"That player has already joined another team."});
  }
  if(!isEligible(jr.player_id)) return res.status(409).json({error:"That player doesn't meet the CleanLobby requirements anymore."});
  db.transaction(()=>{
    db.prepare("INSERT INTO team_members(team_id,player_id) VALUES(?,?)").run(team.id,jr.player_id);
    touchTeam(team.id);
    db.prepare("UPDATE team_join_requests SET status='ACCEPTED',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(jr.id);
    db.prepare("UPDATE team_join_requests SET status='EXPIRED',responded_at=CURRENT_TIMESTAMP WHERE player_id=? AND status='PENDING'").run(jr.player_id);
    db.prepare("UPDATE team_invites SET status='DECLINED',responded_at=CURRENT_TIMESTAMP WHERE invited_player_id=? AND status='PENDING'").run(jr.player_id);
  })();
  res.json(getTeam(team.id));
});

app.post("/api/join-requests/:id/decline", auth, csrf, profileRequired, (req,res)=>{
  const found=joinRequestForCaptain(req,res); if(!found) return;
  db.prepare("UPDATE team_join_requests SET status='DECLINED',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(found.jr.id);
  res.json({ok:true});
});

// ---- Queue / match lifecycle
app.post("/api/teams/:id/unqueue", auth, csrf, profileRequired, (req,res)=>{
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can leave the queue."});
  if(team.status!=="READY") return res.status(409).json({error:"Team is not in the queue."});
  db.transaction(()=>{
    db.prepare("DELETE FROM queue WHERE team_id=?").run(team.id);
    db.prepare("UPDATE teams SET status='OPEN' WHERE id=?").run(team.id);
  })();
  res.json(getTeam(team.id));
});

// Declining a pending match: the declining team leaves the queue, the other team is re-queued.
app.post("/api/matches/:id/decline", auth, csrf, profileRequired, (req,res)=>{
  const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);
  if(!m) return res.status(404).json({error:"Match not found"});
  if(m.status!=="PENDING") return res.status(409).json({error:"This match can no longer be declined."});
  const mine=[m.team_a_id,m.team_b_id].map(id=>getTeam(id)).find(t=>t && t.captain_id===req.account.player_id);
  if(!mine) return res.status(403).json({error:"Only a captain of this match can decline it."});
  const otherId=mine.id===m.team_a_id?m.team_b_id:m.team_a_id;
  db.transaction(()=>{
    db.prepare("UPDATE matches SET status='DECLINED', declined_by_team_id=? WHERE id=?").run(mine.id, m.id);
    db.prepare("UPDATE teams SET status='OPEN' WHERE id=?").run(mine.id);
    db.prepare("UPDATE teams SET status='READY' WHERE id=?").run(otherId);
    db.prepare("INSERT OR IGNORE INTO queue(team_id) VALUES(?)").run(otherId);
  })();
  // Declining is the captain's call, so it counts against the captain only.
  recordEvent(req.account.player_id, "MATCH_DECLINED", m.id);
  computeTrust(req.account.player_id);
  res.json({ok:true});
});

// ---- Match room (see src/matches.js): CS2 private matchmaking code, result reports, public lists.
const PRIVATE_MATCH_COLS = ["lobby_code","lobby_code_by","report_a","report_b","reported_a_at","reported_b_at","voice_a","voice_b"];
function publicMatch(m){ const out={...m}; for(const k of PRIVATE_MATCH_COLS) delete out[k]; return out; }
const captainTeamInMatch=(m,playerId)=>[m.team_a_id,m.team_b_id].map(id=>getTeam(id)).find(t=>t && t.captain_id===playerId);
const matchById=id=>db.prepare("SELECT * FROM matches WHERE id=?").get(id);

app.post("/api/matches/:id/code", auth, csrf, profileRequired, (req,res)=>{
  const m=matchById(req.params.id);
  if(!m) return res.status(404).json({error:"Match not found"});
  if(m.status!=="CONFIRMED") return res.status(409).json({error:"This match room is closed."});
  if(!captainTeamInMatch(m, req.account.player_id)) return res.status(403).json({error:"Only a captain of this match can post the code."});
  const code=cleanLobbyCode(req.body?.code);
  if(!code) return res.status(400).json({error:"Paste the full private matchmaking code from CS2 (letters, numbers and dashes)."});
  db.prepare("UPDATE matches SET lobby_code=?, lobby_code_by=? WHERE id=?").run(code, req.account.player_id, m.id);
  res.json({ok:true});
});

// Optional Discord voice link for the captain's own team; only that team's players ever receive it.
app.post("/api/matches/:id/voice", auth, csrf, profileRequired, (req,res)=>{
  const m=matchById(req.params.id);
  if(!m) return res.status(404).json({error:"Match not found"});
  if(m.status!=="CONFIRMED") return res.status(409).json({error:"This match room is closed."});
  const mine=captainTeamInMatch(m, req.account.player_id);
  if(!mine) return res.status(403).json({error:"Only a captain can share their team's voice channel."});
  const raw=String(req.body?.link||"").trim();
  const link=raw ? cleanVoiceLink(raw) : null;
  if(raw && !link) return res.status(400).json({error:"Paste a Discord invite link, like https://discord.gg/abc123."});
  db.prepare(`UPDATE matches SET ${mine.id===m.team_a_id?"voice_a":"voice_b"}=? WHERE id=?`).run(link, m.id);
  res.json({ok:true, message: link ? "Voice channel shared with your team." : "Voice channel removed."});
});

app.post("/api/matches/:id/result", auth, csrf, profileRequired, (req,res)=>{
  const m=matchById(req.params.id);
  if(!m) return res.status(404).json({error:"Match not found"});
  if(!["CONFIRMED","DISPUTED"].includes(m.status)) return res.status(409).json({error:"This match isn't waiting for a result."});
  const mine=captainTeamInMatch(m, req.account.player_id);
  if(!mine) return res.status(403).json({error:"Only a captain of this match can report the result."});
  const my=Number(req.body?.my_score), their=Number(req.body?.their_score);
  if(![my,their].every(n=>Number.isInteger(n) && n>=0 && n<=60) || my+their===0) return res.status(400).json({error:"Enter both scores, for example 13 and 9."});
  const u=submitReport(m, mine.id, my, their);
  res.json({ok:true, status:u.status, message:u.status==="COMPLETED" ? "Result confirmed. You can now rate the players."
    : u.status==="DISPUTED" ? "The other captain reported a different score. An admin will check it." : "Result saved. Waiting for the other captain."});
});

app.post("/api/admin/matches/:id/result", auth, adminRequired, csrf, (req,res)=>{
  const m=matchById(req.params.id);
  if(!m) return res.status(404).json({error:"Match not found"});
  if(!["CONFIRMED","DISPUTED"].includes(m.status)) return res.status(409).json({error:"This match already has a final result."});
  if(req.body?.no_result===true){ finishMatch(m,"NO_RESULT"); return res.json({ok:true,status:"NO_RESULT"}); }
  const score=parseScore(`${req.body?.score_a}-${req.body?.score_b}`);
  if(!score) return res.status(400).json({error:"score_a and score_b are required"});
  finishMatch(m,"COMPLETED",score[0],score[1]);
  res.json({ok:true,status:"COMPLETED"});
});

// Team country/language = the most common one among its players (shown as flags next to matches).
function teamSummary(teamId){
  const t=getTeam(teamId);
  if(!t) return null;
  const most=k=>{ const c={}; for(const p of t.members) if(p[k]) c[p[k]]=(c[p[k]]||0)+1; return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||null; };
  return { id:t.id, name:t.name, region:t.region, country:most("country"), language:most("language") };
}
app.get("/api/matches", (_,res)=>{
  const shape=m=>({ id:m.id, status:m.status, score_a:m.score_a, score_b:m.score_b, confirmed_at:m.confirmed_at, completed_at:m.completed_at,
    team_a:teamSummary(m.team_a_id), team_b:teamSummary(m.team_b_id) });
  res.json({
    live: db.prepare("SELECT * FROM matches WHERE status='CONFIRMED' ORDER BY confirmed_at DESC LIMIT 50").all().map(shape),
    recent: db.prepare("SELECT * FROM matches WHERE status='COMPLETED' ORDER BY completed_at DESC LIMIT 50").all().map(shape)
  });
});

app.get("/api/stats/live", (_,res)=>{
  const c=(sql,...a)=>db.prepare(sql).get(...a).c;
  res.json({
    online: c("SELECT COUNT(*) c FROM accounts WHERE last_seen_at>?", Date.now()-5*60_000),
    queued_teams: c("SELECT COUNT(*) c FROM queue"),
    recruiting_teams: c("SELECT COUNT(*) c FROM teams WHERE status='OPEN'"),
    live_matches: c("SELECT COUNT(*) c FROM matches WHERE status='CONFIRMED'")
  });
});

// Everything the Play page needs in one call.
app.get("/api/my/dashboard", auth, (req,res)=>{
  const pid=req.account.player_id;
  const player=pid ? db.prepare("SELECT * FROM players WHERE id=?").get(pid) : null;
  const out={ account:{ username:req.account.username, email_verified:!!req.account.email_verified, verified_steam_id:req.account.verified_steam_id||null },
    player, team:null, invites:[], joinRequests:[], myRequests:[], match:null };
  out.now=Date.now();
  if(!player) return res.json(out);
  out.eligibility = !eligibilityEnabled() ? { eligible:true, checks:[] }
    : (player.eligibility ? JSON.parse(player.eligibility) : evaluateEligibility(pid));
  const active=activeTeamForPlayer(pid);
  out.team=active ? getTeam(active.id) : null;
  if(out.team){
    out.team.expires_at=teamExpiresAt(out.team);
    const q=db.prepare("SELECT queued_at FROM queue WHERE team_id=?").get(out.team.id);
    out.team.queue_expires_at=q && out.team.status==="READY" ? queueExpiresAt(q.queued_at) : null;
  }
  out.invites=db.prepare(`SELECT i.id,i.team_id,t.name AS team_name,t.region,p.display_name AS invited_by,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) AS count
    FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN players p ON p.id=i.invited_by_player_id
    WHERE i.invited_player_id=? AND i.status='PENDING' AND t.status='OPEN' ORDER BY i.id DESC`).all(pid);
  out.myRequests=db.prepare(`SELECT r.id,r.team_id,t.name AS team_name FROM team_join_requests r JOIN teams t ON t.id=r.team_id
    WHERE r.player_id=? AND r.status='PENDING' AND t.status='OPEN'`).all(pid);
  if(out.team && out.team.captain_id===pid){
    out.joinRequests=db.prepare(`SELECT r.id,p.id AS player_id,p.display_name,p.premier_rating,p.languages,p.role,p.country,p.region,p.trust_score
      FROM team_join_requests r JOIN players p ON p.id=r.player_id WHERE r.team_id=? AND r.status='PENDING' ORDER BY r.id`).all(out.team.id);
  }
  // Latest match the player is in: pending, live or disputed, or one that ended in the last 24 hours
  // (so they can see the result and rate the players).
  const teamIds=db.prepare("SELECT team_id FROM team_members WHERE player_id=?").all(pid).map(r=>r.team_id);
  if(teamIds.length){
    const ph=teamIds.map(()=>"?").join(",");
    const m=db.prepare(`SELECT * FROM matches WHERE (status IN ('PENDING','CONFIRMED','DISPUTED') OR (status IN ('COMPLETED','NO_RESULT') AND completed_at>?))
      AND (team_a_id IN (${ph}) OR team_b_id IN (${ph})) ORDER BY id DESC LIMIT 1`).get(Date.now()-86_400_000,...teamIds,...teamIds);
    if(m){
      const myTeamId=teamIds.includes(m.team_a_id)?m.team_a_id:m.team_b_id;
      const others=db.prepare("SELECT player_id FROM team_members WHERE team_id IN (?,?) AND player_id<>?").all(m.team_a_id,m.team_b_id,pid).map(r=>r.player_id);
      const rated=others.length ? db.prepare(`SELECT to_player_id id FROM trust_ratings WHERE from_player_id=? AND to_player_id IN (${others.map(()=>"?").join(",")})`).all(pid,...others).map(r=>r.id) : [];
      const { voice_a, voice_b, ...shared }=m;   // each team only receives its own voice link
      out.match={...shared, my_voice:myTeamId===m.team_a_id?voice_a:voice_b, my_team_id:myTeamId, expires_at:matchExpiresAt(m), result_deadline:resultDeadline(m), rated,
        team_a:getTeam(m.team_a_id), team_b:getTeam(m.team_b_id)};
    }
  }
  res.json(out);
});

// ---- Eligibility: re-check after a player makes their Steam profile public, admin override.
app.post("/api/me/eligibility/recheck", auth, csrf, profileRequired, async (req,res)=>{
  const ext=db.prepare("SELECT steam_fetched_at FROM player_external WHERE player_id=?").get(req.account.player_id);
  if(ext?.steam_fetched_at && Date.now()-ext.steam_fetched_at<60_000) return res.status(429).json({error:"Checked less than a minute ago. Steam can take a few minutes to apply privacy changes."});
  await refreshExternal(req.account.player_id);
  computeTrust(req.account.player_id);
  res.json(evaluateEligibility(req.account.player_id));
});

app.post("/api/admin/players/:id/eligibility", auth, adminRequired, csrf, (req,res)=>{
  const v=req.body?.override; // true = approve, false = block, null = automatic
  if(![true,false,null].includes(v)) return res.status(400).json({error:"override must be true, false or null"});
  const r=db.prepare("UPDATE players SET eligibility_override=? WHERE id=?").run(v===null?null:(v?1:0), req.params.id);
  if(!r.changes) return res.status(404).json({error:"Player not found"});
  res.json(evaluateEligibility(Number(req.params.id)));
});

// ---- Contact form: delivered by email to CONTACT_EMAIL (nothing is stored in the database).
const CONTACT_TOPICS = ["Help with my account","Report a player","Disputed match result","Partnership or sponsoring","My data (privacy request)","Something else"];
const contactHits = new Map();   // ip -> timestamps of recent messages (max 3 per hour)
app.post("/api/contact", async (req, res) => {
  if (req.body?.website) return res.json({ ok: true });   // hidden field only bots fill in
  const topic = CONTACT_TOPICS.includes(req.body?.topic) ? req.body.topic : null;
  const email = String(req.body?.email || "").trim().toLowerCase();
  const message = String(req.body?.message || "").trim();
  if (!topic) return res.status(400).json({ error: "Choose what your message is about." });
  if (email && !emailValid(email)) return res.status(400).json({ error: "Check your email address, or leave it empty." });
  if (message.length < 10) return res.status(400).json({ error: "Write a few more words so we can help." });
  if (message.length > 4000) return res.status(400).json({ error: "Keep your message under 4000 characters." });
  const now = Date.now(), recent = (contactHits.get(req.ip) || []).filter(t => now - t < 3_600_000);
  if (recent.length >= 3) return res.status(429).json({ error: `You've sent 3 messages in the last hour. Email ${CONTACT_EMAIL} directly if it's urgent.` });
  const who = sessionAccount(req);
  const text = [`Topic: ${topic}`, `Reply to: ${email || "(no email given)"}`, `CleanLobby account: ${who ? who.username : "(not signed in)"}`, "", message].join("\n");
  if (!process.env.SMTP_HOST) {
    if (isProduction) return res.status(503).json({ error: `The form isn't available right now. Email ${CONTACT_EMAIL} instead.` });
    console.log(`[STACK5 DEV] Contact message:\n${text}`);
  } else {
    try {
      await mailTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: CONTACT_EMAIL, replyTo: email || undefined,
        subject: `[CleanLobby contact] ${topic}${who ? ` · ${who.username}` : ""}`, text });
    } catch (e) {
      console.error("[STACK5] contact email failed:", e.message);
      return res.status(502).json({ error: `Your message couldn't be sent. Email ${CONTACT_EMAIL} instead.` });
    }
  }
  recent.push(now); contactHits.set(req.ip, recent);
  res.json({ ok: true, message: email ? "Message sent. We'll reply to your email." : "Message sent. Add an email next time if you want a reply." });
});
app.get("/api/contact/info", (_, res) => res.json({ email: CONTACT_EMAIL, topics: CONTACT_TOPICS }));

// ---- Optional email (notifications, contact). Empty removes it; a new one needs verifying.
app.post("/api/account/email", auth, csrf, async (req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase()||null;
  if(email && !emailValid(email)) return res.status(400).json({error:"Enter a valid email address."});
  if(email && email===req.account.email) return res.json({ok:true, message:"That's already your email."});
  if(email && db.prepare("SELECT 1 FROM accounts WHERE lower(email)=? AND id<>?").get(email, req.account.account_id)) return res.status(409).json({error:"That email is already used by another account."});
  const token=email ? randomToken(32) : null;
  db.prepare("UPDATE accounts SET email=?, email_verified=0, verification_token_hash=?, verification_expires_at=? WHERE id=?")
    .run(email, token && hash(token), token && Date.now()+VERIFY_HOURS*3600000, req.account.account_id);
  if(!email) return res.json({ok:true, message:"Email removed."});
  try { await sendVerificationEmail({ email }, token); }
  catch { return res.status(500).json({error:"Email saved, but we couldn't send the verification link right now. Try again later."}); }
  res.json({ok:true, message:"Saved. Check your inbox for the verification link."});
});

// ---- Self-service account deletion (Privacy Policy section 8/9).
app.post("/api/account/delete", auth, csrf, async (req,res)=>{
  if(req.body?.confirm!=="DELETE") return res.status(400).json({error:'Type DELETE to confirm.'});
  const account=db.prepare("SELECT * FROM accounts WHERE id=?").get(req.account.account_id);
  if(!account) return res.status(404).json({error:"Account not found."});
  const pid=account.player_id;
  if(pid){
    const active=activeTeamForPlayer(pid);
    if(active && active.status==="MATCH_CONFIRMED") return res.status(409).json({error:"You are in a live match. Delete your account once it has a result."});
    if(active && active.status==="MATCHED") return res.status(409).json({error:"You have a pending match. Accept or decline it first."});
  }
  const rated=pid ? db.prepare("SELECT DISTINCT to_player_id id FROM trust_ratings WHERE from_player_id=?").all(pid).map(r=>r.id) : [];
  db.transaction(()=>{
    if(pid){
      const active=activeTeamForPlayer(pid);
      if(active){
        const team=getTeam(active.id);
        if(team.captain_id===pid){
          db.prepare("UPDATE teams SET status='CANCELLED' WHERE id=?").run(team.id);
          db.prepare("DELETE FROM queue WHERE team_id=?").run(team.id);
          db.prepare("UPDATE team_invites SET status='CANCELLED' WHERE team_id=? AND status='PENDING'").run(team.id);
          db.prepare("UPDATE team_join_requests SET status='EXPIRED' WHERE team_id=? AND status='PENDING'").run(team.id);
        } else removeFromRoster(team, pid);
      }
      db.prepare("DELETE FROM trust_ratings WHERE from_player_id=? OR to_player_id=?").run(pid,pid);
      db.prepare("DELETE FROM team_invites WHERE invited_player_id=? AND status='PENDING'").run(pid);
      db.prepare("DELETE FROM team_join_requests WHERE player_id=?").run(pid);
      db.prepare("DELETE FROM player_external WHERE player_id=?").run(pid);
      db.prepare("DELETE FROM player_events WHERE player_id=?").run(pid);
      // Past teams/matches keep a placeholder row so history stays consistent; nothing identifies the person.
      db.prepare(`UPDATE players SET steam_url=?, steam_id=NULL, steam_verified=0, display_name='Deleted player', avatar_url=NULL, country=NULL,
        language=NULL, languages=NULL, role=NULL, faceit_level=0, faceit_elo=0, faceit_verified=0, premier_rating=NULL, availability='', trust_breakdown=NULL,
        eligibility=NULL, eligible=0, deleted_at=? WHERE id=?`).run(`deleted:${pid}`, Date.now(), pid);
    }
    db.prepare("DELETE FROM sessions WHERE account_id=?").run(account.id);
    db.prepare("DELETE FROM accounts WHERE id=?").run(account.id);
  })();
  for(const id of rated) computeTrust(id);
  res.setHeader("Set-Cookie", `stack5_session=; ${cookieOptions(0)}`);
  res.json({ok:true});
});

app.use("/assets", express.static(path.join(__dirname, "../public")));

app.get("/api/discover/teams", (_, res) => {
  const teams = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.region,
      t.min_rating,
      t.max_rating,
      t.status,
      COUNT(tm.player_id) AS count
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id=t.id
    WHERE t.status='OPEN'
    GROUP BY t.id
    HAVING count < 5
    ORDER BY t.created_at DESC
  `).all();
  // Languages every current member speaks, so players can pick a team they can talk to.
  const langs = db.prepare("SELECT p.languages FROM team_members tm JOIN players p ON p.id=tm.player_id WHERE tm.team_id=?");
  for (const t of teams) {
    const sets = langs.all(t.id).map(r => (r.languages || "").split(",").filter(Boolean));
    t.languages = sets.length ? sets.reduce((a, b) => a.filter(x => b.includes(x))) : [];
  }
  res.json(teams);
});

app.get("/login", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/login.html")));
app.get("/terms", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/terms.html")));
app.get("/privacy", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/privacy.html")));
app.get(["/register","/forgot-password","/reset-password"], (_,res)=>res.redirect("/login"));

// ---- App pages: one HTML shell, with per-page title/description/robots for search engines and link previews.
const APP_SHELL=fs.readFileSync(path.join(__dirname,"../public/pages/app.html"),"utf8");
const SITE_DESC="We don’t want eggs, we want a cheater-free game. CS2 5v5 for full teams: Steam-verified players, matched by Premier rating, public Trust Score. Free beta.";
const PAGES={
  "/":        { title:"CleanLobby · Trusted CS2 5v5 team matchmaking", heading:"We don’t want eggs. We want a cheater-free game.", description:SITE_DESC },
  "/teams":   { title:"Find a CS2 team · CleanLobby", heading:"Find a CS2 team", description:"Browse CS2 5-stacks that are recruiting on CleanLobby and ask to join. Every player is Steam-verified with a public trust score." },
  "/players": { title:"Find CS2 players · CleanLobby", heading:"Find CS2 players", description:"Find Steam-verified CS2 players for your 5-stack by region, level, role and language, with a trust score built from real matches." },
  "/matches": { title:"CS2 5v5 matches and results · CleanLobby", heading:"CS2 5v5 matches", description:"Live CleanLobby matches and recent results between complete CS2 teams, played through CS2 Private Matchmaking." },
  "/rankings":{ title:"CS2 team rankings · CleanLobby", heading:"Rankings", description:"CleanLobby rankings for CS2 5v5 teams and players. Coming soon." },
  "/guide":   { title:"How CleanLobby works: CS2 5v5 player guide · CleanLobby", heading:"How CleanLobby works", description:"Step-by-step guide to CleanLobby: sign in with Steam, build your CS2 5-stack, find a match, play through CS2 Private Matchmaking, report the score and build your Trust Score." },
  "/contact": { title:"Contact · CleanLobby", heading:"Contact CleanLobby", description:"Contact the CleanLobby team: help with your account, report a player, a disputed match result, partnerships or privacy requests. Email contact@cleanlobby.com." }
};
const htmlAttr=v=>String(v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]);
function sendApp(req,res,page,{index=true,status=200}={}){
  const url=BASE_URL+(req.path==="/"?"/":req.path.replace(/\/$/,""));
  const jsonld=JSON.stringify({ "@context":"https://schema.org", "@graph":[
    { "@type":"WebSite", "@id":BASE_URL+"/#website", name:"CleanLobby", url:BASE_URL+"/", description:SITE_DESC, inLanguage:"en" },
    { "@type":"WebApplication", name:"CleanLobby", url:BASE_URL+"/", applicationCategory:"GameApplication", operatingSystem:"Web",
      description:SITE_DESC, offers:{ "@type":"Offer", price:"0", priceCurrency:"USD" }, about:{ "@type":"VideoGame", name:"Counter-Strike 2" } }
  ]});   // fixed text only (no user input), safe inside <script>
  const vals={ title:page.title, description:page.description, heading:page.heading, url, base:BASE_URL, robots:index?"index,follow":"noindex,follow" };
  let html=APP_SHELL.replace("{{jsonld}}",jsonld);
  for(const [k,v] of Object.entries(vals)) html=html.split(`{{${k}}}`).join(htmlAttr(v));
  res.status(status).type("html").send(html);
}
app.get("/robots.txt",(_,res)=>res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /admin
Disallow: /account
Disallow: /play
Disallow: /welcome
Disallow: /pages/
Disallow: /assets/pages/

Sitemap: ${BASE_URL}/sitemap.xml
`));
app.get("/sitemap.xml",(_,res)=>res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...Object.keys(PAGES),"/login","/terms","/privacy"].map(p=>`  <url><loc>${BASE_URL}${p}</loc></url>`).join("\n")}
</urlset>
`));
// llms.txt: a plain summary for AI assistants and LLM crawlers (llmstxt.org).
app.get("/llms.txt",(_,res)=>res.type("text/plain").send(`# CleanLobby

> CleanLobby is a free CS2 (Counter-Strike 2) 5v5 team matchmaking platform focused on trust. Complete teams of five play against other complete teams, every player is a Steam-verified account, and a public Trust Score is built from Steam history, peer ratings, reliability and match record. Strong focus on North Africa (Morocco, Algeria, Tunisia, Libya, Egypt), open worldwide. Currently in beta.

## How it works

- Teams are matched by CS2 Premier rating (entered by players), region and Trust Score.
- Players sign in through Steam (OpenID). CleanLobby only receives the public SteamID; it never sees Steam passwords and has no access to inventories, skins or trades.
- To play, a Steam account must be at least 2 years old, have at least 500 hours of CS2 and no VAC or game ban in the last 2 years.
- A captain creates a team and invites four players. Teammates pick each other by language (players list the languages they speak). Full teams queue and are matched with a team whose players' countries are close enough for good ping (up to about 2,500 km apart), at a similar CS2 Premier rating.
- Matches are played on Valve servers through CS2 Private Matchmaking: one captain creates a private matchmaking pool and shares its code on CleanLobby, both 5-player parties join with that code.
- After the game both captains report the score. Players then rate each other (1-5 stars), which feeds the Trust Score.
- CleanLobby is a reputation layer, not an anti-cheat.

## Pages

- [Home](${BASE_URL}/): what CleanLobby is
- [Find a team](${BASE_URL}/teams): teams that are recruiting
- [Find players](${BASE_URL}/players): Steam-verified players with trust scores
- [Matches](${BASE_URL}/matches): live matches and recent results
- [Sign in with Steam](${BASE_URL}/login)
- [Terms of Service](${BASE_URL}/terms)
- [Privacy Policy](${BASE_URL}/privacy)

## Contact

contact@cleanlobby.com
`));
for(const [p,page] of Object.entries(PAGES)) app.get(p,(req,res)=>sendApp(req,res,page));
// Personal and per-player pages work normally but stay out of search results.
for(const p of ["/play","/account","/player/:username","/team/:id"]) app.get(p,(req,res)=>sendApp(req,res,PAGES["/"],{index:false}));
app.get("*splat",(req,res)=>sendApp(req,res,{ ...PAGES["/"], title:"Page not found · CleanLobby", heading:"Page not found" },{index:false,status:404}));
// Time limits (idle teams, queue, match accept window). TIMERS_INTERVAL_SECONDS=0 disables.
const timersEvery=Number(process.env.TIMERS_INTERVAL_SECONDS ?? 30);
if(timersEvery>0) setInterval(()=>{
  try { const r=expireStale(); if(r.teams||r.queue||r.matches||r.results) console.log(`[STACK5] timers: disbanded ${r.teams} team(s), ${r.queue} left queue, ${r.matches} match(es) expired, ${r.results} result(s) closed`); }
  catch(e){ console.error("[STACK5] timers failed:", e); }
}, timersEvery*1000).unref();

// Automatic matchmaking. Set MATCHMAKING_INTERVAL_SECONDS=0 to disable (admin can still run it manually).
const mmEvery=Number(process.env.MATCHMAKING_INTERVAL_SECONDS ?? 30);
if(mmEvery>0) setInterval(()=>{
  try { const m=runMatchmaking(); if(m.length) console.log(`[STACK5] matchmaking created ${m.length} match(es)`); }
  catch(e){ console.error("[STACK5] matchmaking failed:", e); }
}, mmEvery*1000).unref();

// Trust upkeep: refresh Steam/FACEIT data older than 7 days (a small batch at a time, so the
// APIs are never hammered), then rescore everyone. Runs shortly after start and every 6 hours.
async function trustUpkeep(){
  const stale=db.prepare(`SELECT p.id FROM players p LEFT JOIN player_external e ON e.player_id=p.id
    WHERE p.deleted_at IS NULL AND (e.steam_fetched_at IS NULL OR e.steam_fetched_at < ?) ORDER BY e.steam_fetched_at IS NOT NULL, e.steam_fetched_at LIMIT 100`).all(Date.now()-7*86_400_000);
  if(process.env.STEAM_API_KEY){
    for(const {id} of stale){ await refreshExternal(id).catch(()=>{}); await new Promise(r=>setTimeout(r,300)); }
  }
  // Premier ratings copied from Leetify: fill missing ones and refresh daily (not ones players typed).
  const premierDue=db.prepare(`SELECT id FROM players WHERE deleted_at IS NULL AND steam_id IS NOT NULL AND (premier_source IS NULL OR premier_source='leetify')
    AND (premier_synced_at IS NULL OR premier_synced_at < ?) LIMIT 200`).all(Date.now()-86_400_000);
  let synced=0;
  for(const {id} of premierDue){ if(await syncPremierFromLeetify(id).catch(()=>null)) synced++; await new Promise(r=>setTimeout(r,500)); }
  const n=recomputeAll();
  for(const {id} of db.prepare("SELECT id FROM players WHERE deleted_at IS NULL").all()) evaluateEligibility(id);
  console.log(`[STACK5] trust upkeep: refreshed ${process.env.STEAM_API_KEY ? stale.length : 0}, Premier from Leetify ${synced}/${premierDue.length}, rescored ${n}`);
}
if(process.env.NODE_ENV!=="test"){
  setTimeout(()=>trustUpkeep().catch(e=>console.error("[STACK5] trust upkeep failed:",e)),5000).unref();
  setInterval(()=>trustUpkeep().catch(e=>console.error("[STACK5] trust upkeep failed:",e)),6*3600_000).unref();
}
app.post("/api/admin/trust/recompute", auth, adminRequired, csrf, async (_,res)=>{ await trustUpkeep(); res.json({ok:true}); });

const port=Number(process.env.PORT||3000);app.listen(port,"0.0.0.0",()=>console.log(`CleanLobby listening on ${port}`));
