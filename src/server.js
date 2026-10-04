import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { db, getTeam, getTeamMembers } from "./db.js";
import { normalizeSteamUrl, lookupCSST } from "./csst.js";
import { runMatchmaking } from "./matchmaking.js";
import { REGION_CATALOG, COUNTRY_CATALOG } from "./regions.js";

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
function scrypt(password, salt) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (e, d) => e ? reject(e) : resolve(d.toString("hex")))); }
async function verifyPassword(password, salt, expected) {
  const actual = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
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
    if (isProduction) throw new Error("Email delivery is not configured yet. Set SMTP_HOST/SMTP_USER/SMTP_PASS and restart STACK5.");
    return url;
  }
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE) === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: account.email, subject: "Verify your STACK5 account", text: `Verify your STACK5 account: ${url}` });
  return null;
}

async function createSession(accountId, res) {
  const raw = randomToken(32), csrf = randomToken(24);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare("INSERT INTO sessions(account_id,token_hash,csrf_token,expires_at) VALUES(?,?,?,?)").run(accountId, hash(raw), csrf, expires);
  res.setHeader("Set-Cookie", `stack5_session=${encodeURIComponent(raw)}; ${cookieOptions(SESSION_DAYS * 86400)}`);
  return csrf;
}

function auth(req, res, next) {
  const raw = getCookie(req, "stack5_session");
  if (!raw) return res.status(401).json({ error: "Authentication required" });
  const session = db.prepare(`SELECT s.*, a.username, a.email, a.email_verified, a.is_admin, a.player_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?`).get(hash(raw));
  if (!session || session.expires_at < Date.now()) return res.status(401).json({ error: "Session expired. Please log in again." });
  req.account = session;
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
    verifiedAccounts: count("SELECT COUNT(*) AS count FROM accounts WHERE email_verified=1"),
    admins: count("SELECT COUNT(*) AS count FROM accounts WHERE is_admin=1"),
    players: count("SELECT COUNT(*) AS count FROM players"),
    teams: count("SELECT COUNT(*) AS count FROM teams"),
    openTeams: count("SELECT COUNT(*) AS count FROM teams WHERE status='OPEN'"),
    readyTeams: count("SELECT COUNT(*) AS count FROM teams WHERE status='READY'"),
    queuedTeams: count("SELECT COUNT(*) AS count FROM queue"),
    matches: count("SELECT COUNT(*) AS count FROM matches"),
    confirmedMatches: count("SELECT COUNT(*) AS count FROM matches WHERE status='CONFIRMED'")
  });
});

app.get("/api/admin/accounts", auth, adminRequired, (req, res) => {
  res.json(db.prepare(`SELECT a.id,a.username,a.email,a.email_verified,a.is_admin,a.player_id,a.created_at,
    p.display_name,p.country,p.region,p.faceit_level
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

app.post("/api/auth/register", async (req, res) => {
  if (!requireBody(req, res, ["username","email","password","password_confirm","terms"])) return;
  const username = String(req.body.username).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "Username must be 3–24 characters using letters, numbers or underscore." });
  if (!emailValid(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10) return res.status(400).json({ error: "Password must be at least 10 characters." });
  if (password !== req.body.password_confirm) return res.status(400).json({ error: "Passwords do not match." });
  if (!(req.body.terms === true || req.body.terms === "true" || req.body.terms === "on")) return res.status(400).json({ error: "You must accept the STACK5 terms." });
  if (db.prepare("SELECT id FROM accounts WHERE lower(email)=lower(?) OR lower(username)=lower(?)").get(email, username)) return res.status(409).json({ error: "An account with that email or username already exists." });
  const salt = randomToken(16), passwordHash = await scrypt(password, salt), token = randomToken(32);
  const tx = db.transaction(() => db.prepare(`INSERT INTO accounts(username,email,password_hash,password_salt,email_verified,verification_token_hash,verification_expires_at,terms_accepted_at) VALUES(?,?,?,?,0,?,?,CURRENT_TIMESTAMP)`).run(username,email,passwordHash,salt,hash(token),Date.now()+VERIFY_HOURS*3600000));
  let account;
  try { const r = tx(); account = db.prepare("SELECT id,username,email,email_verified,player_id FROM accounts WHERE id=?").get(r.lastInsertRowid); await sendVerificationEmail(account, token); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  res.status(201).json({ ok: true, email_verified: false, message: "Account created. Verify your email before completing your player profile." });
});

app.post("/api/auth/resend-verification", async (req, res) => {
  if (!requireBody(req, res, ["email"])) return;

  const email = String(req.body.email).trim().toLowerCase();
  if (!emailValid(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const account = db.prepare(
    "SELECT id,username,email,email_verified FROM accounts WHERE lower(email)=lower(?)"
  ).get(email);

  // Don't reveal whether an email exists.
  if (!account || account.email_verified) {
    return res.json({
      ok: true,
      message: "If the account exists and still needs verification, a new verification email has been sent."
    });
  }

  const token = randomToken(32);

  db.prepare(`
    UPDATE accounts
    SET verification_token_hash=?,
        verification_expires_at=?
    WHERE id=?
  `).run(
    hash(token),
    Date.now() + VERIFY_HOURS * 3600000,
    account.id
  );

  try {
    await sendVerificationEmail(account, token);
  } catch (e) {
    return res.status(500).json({ error: "Unable to send verification email right now." });
  }

  res.json({
    ok: true,
    message: "A new verification email has been sent."
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  if (!requireBody(req, res, ["email"])) return;

  const email = String(req.body.email).trim().toLowerCase();

  if (!emailValid(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const account = db.prepare(
    "SELECT id,username,email FROM accounts WHERE lower(email)=lower(?)"
  ).get(email);

  // Never reveal whether an account exists.
  if (!account) {
    return res.json({
      ok: true,
      message: "If an account exists for that email, a password reset link has been sent."
    });
  }

  const token = randomToken(32);
  const tokenHash = hash(token);
  const expiresAt = Date.now() + 60 * 60 * 1000;

  db.prepare(`
    UPDATE accounts
    SET reset_token_hash=?,
        reset_expires_at=?
    WHERE id=?
  `).run(tokenHash, expiresAt, account.id);

  const url = `${BASE_URL}/reset-password?token=${token}`;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: account.email,
      subject: "Reset your STACK5 password",
      text:
        `Reset your STACK5 password using this link:\n\n${url}\n\n` +
        `This link expires in 1 hour and can only be used once.\n\n` +
        `If you did not request a password reset, you can safely ignore this email.`
    });
  } catch (e) {
    // Do not leave a usable reset token if email delivery failed.
    db.prepare(`
      UPDATE accounts
      SET reset_token_hash=NULL,
          reset_expires_at=NULL
      WHERE id=?
    `).run(account.id);

    console.error("Password reset email failed:", e);
  }

  res.json({
    ok: true,
    message: "If an account exists for that email, a password reset link has been sent."
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  if (!requireBody(req, res, ["token", "password", "password_confirm"])) return;

  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  const passwordConfirm = String(req.body.password_confirm || "");

  if (!token) {
    return res.status(400).json({ error: "Invalid or expired reset link." });
  }

  if (password.length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters." });
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const account = db.prepare(`
    SELECT id
    FROM accounts
    WHERE reset_token_hash=?
      AND reset_expires_at>?
  `).get(hash(token), Date.now());

  if (!account) {
    return res.status(400).json({ error: "This password reset link is invalid or expired." });
  }

  const salt = randomToken(16);
  const passwordHash = await scrypt(password, salt);

  db.prepare(`
    UPDATE accounts
    SET password_hash=?,
        password_salt=?,
        reset_token_hash=NULL,
        reset_expires_at=NULL
    WHERE id=?
  `).run(passwordHash, salt, account.id);

  // Invalidate existing sessions so the password change takes effect everywhere.
  db.prepare("DELETE FROM sessions WHERE account_id=?").run(account.id);

  res.json({
    ok: true,
    message: "Your password has been reset. You can now log in."
  });
});

app.get("/reset-password", (req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset password — STACK5</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#080809;
  color:#f4f4f5;
  font-family:Inter,system-ui,-apple-system,sans-serif;
}
.card{
  width:min(460px,calc(100% - 32px));
  background:#111113;
  border:1px solid #27272a;
  border-radius:18px;
  padding:30px;
}
h1{margin-top:0}
p{color:#a1a1aa;line-height:1.5}
label{
  display:block;
  font-size:12px;
  color:#a1a1aa;
  margin:15px 0 6px;
}
input{
  width:100%;
  box-sizing:border-box;
  padding:13px;
  border-radius:10px;
  border:1px solid #3f3f46;
  background:#18181b;
  color:white;
  font-size:15px;
}
button{
  width:100%;
  margin-top:18px;
  padding:13px;
  border:0;
  border-radius:10px;
  background:#a3e635;
  color:#101010;
  font-weight:900;
  cursor:pointer;
}
.message{
  margin-top:15px;
  color:#d4d4d8;
  font-size:13px;
  white-space:pre-wrap;
}
a{color:#a3e635}
</style>
</head>
<body>
<div class="card">
  <h1>Reset your STACK5 password</h1>
  <p>Choose a new password for your STACK5 account.</p>

  <form id="resetForm">
    <label>New password</label>
    <input type="password" name="password" minlength="10" required>

    <label>Confirm new password</label>
    <input type="password" name="password_confirm" minlength="10" required>

    <button type="submit">Reset password</button>
  </form>

  <div id="msg" class="message"></div>
</div>

<script>
const token = new URLSearchParams(location.search).get("token");
const form = document.getElementById("resetForm");
const msg = document.getElementById("msg");

if (!token) {
  form.style.display = "none";
  msg.textContent = "This password reset link is invalid.";
}

form.onsubmit = async e => {
  e.preventDefault();
  msg.textContent = "Resetting password...";

  const data = Object.fromEntries(new FormData(form));
  data.token = token;

  try {
    const r = await fetch("/api/auth/reset-password", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    });

    const j = await r.json();

    if (!r.ok) throw new Error(j.error || "Password reset failed.");

    msg.innerHTML = j.message + ' <a href="/">Log in</a>';
    form.style.display = "none";
  } catch (err) {
    msg.textContent = err.message;
  }
};
</script>
</body>
</html>`);
});

app.get("/verify-email", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Invalid verification link.");
  const account = db.prepare("SELECT id FROM accounts WHERE verification_token_hash=? AND verification_expires_at>? AND email_verified=0").get(hash(token), Date.now());
  if (!account) return res.status(400).send("This verification link is invalid or expired.");
  db.prepare("UPDATE accounts SET email_verified=1, verification_token_hash=NULL, verification_expires_at=NULL WHERE id=?").run(account.id);
  res.redirect("/?verified=1");
});

app.post("/api/auth/login", async (req, res) => {
  if (!requireBody(req, res, ["email","password"])) return;
  const account = db.prepare("SELECT * FROM accounts WHERE lower(email)=lower(?)").get(String(req.body.email).trim().toLowerCase());
  if (!account || !(await verifyPassword(String(req.body.password), account.password_salt, account.password_hash))) return res.status(401).json({ error: "Invalid email or password." });
  const csrfToken = await createSession(account.id, res);
  res.json({ ok: true, csrf_token: csrfToken, email_verified: !!account.email_verified, profile_complete: !!account.player_id, username: account.username });
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

app.post("/api/profile", auth, csrf, async (req, res) => {
  if (!req.account.email_verified) return res.status(403).json({ error: "Verify your email before creating your player profile." });
  if (!requireBody(req, res, ["steam_url","country","region","faceit_level","role","language"])) return;
  const country = COUNTRY_CATALOG.find(x => x[0] === req.body.country);
  const region = REGION_CATALOG.find(x => x.id === req.body.region);
  if (!country || !region) return res.status(400).json({ error: "Invalid country or region." });
  if (country[2] !== region.id) return res.status(400).json({ error: "Country and matchmaking region do not match." });
  try {
    const steamUrl = normalizeSteamUrl(req.body.steam_url);
    const data = await lookupCSST(steamUrl);
    const name = String(req.body.display_name || req.account.username).slice(0,40);
    const result = db.transaction(() => {
      const existing = db.prepare("SELECT id FROM players WHERE steam_url=?").get(steamUrl);
      if (existing) throw new Error("This Steam profile is already linked to a STACK5 player.");
      const r = db.prepare(`INSERT INTO players(steam_url,display_name,avatar_url,faceit_level,faceit_elo,region,country,language,role) VALUES(?,?,?,?,?,?,?,?,?)`).run(steamUrl,name,safeAvatarUrl(req.body.avatar_url),Number(req.body.faceit_level),Number(req.body.faceit_elo||0),region.id,country[0],String(req.body.language).slice(0,10),String(req.body.role).slice(0,20));
      db.prepare("UPDATE accounts SET player_id=? WHERE id=?").run(r.lastInsertRowid, req.account.account_id);
      return r.lastInsertRowid;
    })();
    res.status(201).json({ player: db.prepare("SELECT * FROM players WHERE id=?").get(result), source:data });
  } catch(e) { res.status(400).json({ error:e.message }); }
});

app.get("/api/players", (_, res) => res.json(db.prepare(`SELECT id,steam_url,display_name,avatar_url,faceit_level,faceit_elo,region,country,language,role,trust_score,reliability_score,teamplay_score FROM players ORDER BY id DESC`).all()));
app.get("/api/players/:id", (req,res) => { const p=db.prepare("SELECT * FROM players WHERE id=?").get(req.params.id); if(!p) return res.status(404).json({error:"Player not found"}); res.json(p); });

function activeTeamForPlayer(playerId) {
  return db.prepare(`SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id=t.id
    WHERE tm.player_id=? AND t.status NOT IN ('MATCH_CONFIRMED','CANCELLED') ORDER BY t.id DESC LIMIT 1`).get(playerId);
}

app.get("/api/my/teams", auth, profileRequired, (req,res) => {
  res.json(db.prepare(`SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.player_id=? ORDER BY t.id DESC`).all(req.account.player_id).map(t => getTeam(t.id)));
});

app.get("/api/team-invites", auth, profileRequired, (req,res) => {
  res.json(db.prepare(`SELECT i.*,t.name AS team_name,t.region,p.display_name AS invited_by
    FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN players p ON p.id=i.invited_by_player_id
    WHERE i.invited_player_id=? AND i.status='PENDING' ORDER BY i.id DESC`).all(req.account.player_id));
});

app.post("/api/teams", auth, csrf, profileRequired, (req,res) => {
  if (!requireBody(req,res,["name"])) return;
  if (activeTeamForPlayer(req.account.player_id)) return res.status(409).json({error:"You are already in an active team."});
  const captain=db.prepare("SELECT * FROM players WHERE id=?").get(req.account.player_id);
  if(!captain) return res.status(404).json({error:"Player not found"});
  const region=req.body.region || captain.region;
  if (!REGION_CATALOG.some(r=>r.id===region)) return res.status(400).json({error:"Invalid region"});
  const min=Math.max(1,Math.min(10,Number(req.body.min_level||1)));
  const max=Math.max(min,Math.min(10,Number(req.body.max_level||10)));
  const name=String(req.body.name).trim().slice(0,40);
  if(name.length<2) return res.status(400).json({error:"Team name must be at least 2 characters."});
  const result=db.prepare("INSERT INTO teams(name,captain_id,region,min_level,max_level,scheduled_at) VALUES(?,?,?,?,?,?)").run(name,captain.id,region,min,max,req.body.scheduled_at||null);
  db.prepare("INSERT INTO team_members(team_id,player_id) VALUES(?,?)").run(result.lastInsertRowid,captain.id);
  res.status(201).json(getTeam(result.lastInsertRowid));
});

app.get("/api/teams/:id", (req,res)=>{const team=getTeam(req.params.id);if(!team)return res.status(404).json({error:"Team not found"});res.json(team);});

app.post("/api/teams/:id/invite", auth, csrf, profileRequired, (req,res)=>{
  if(!requireBody(req,res,["username"])) return;
  const team=getTeam(req.params.id);
  if(!team) return res.status(404).json({error:"Team not found"});
  if(team.captain_id!==req.account.player_id) return res.status(403).json({error:"Only the captain can invite players."});
  if(team.count>=5) return res.status(409).json({error:"Team is already full."});
  if(team.status!=="OPEN") return res.status(409).json({error:"Team is no longer open."});
  const target=db.prepare("SELECT p.* FROM players p JOIN accounts a ON a.player_id=p.id WHERE lower(a.username)=lower(?)").get(String(req.body.username).trim());
  if(!target) return res.status(404).json({error:"STACK5 player not found."});
  if(target.id===req.account.player_id) return res.status(400).json({error:"You cannot invite yourself."});
  if(team.members.some(x=>x.id===target.id)) return res.status(409).json({error:"That player is already in the team."});
  if(activeTeamForPlayer(target.id)) return res.status(409).json({error:"That player is already in an active team."});
  const existing=db.prepare("SELECT id FROM team_invites WHERE team_id=? AND invited_player_id=? AND status='PENDING'").get(team.id,target.id);
  if(existing) return res.status(409).json({error:"An invitation is already pending."});
  db.prepare(`INSERT INTO team_invites(team_id,invited_player_id,invited_by_player_id) VALUES(?,?,?)`).run(team.id,target.id,req.account.player_id);
  res.status(201).json({ok:true,message:`Invitation sent to ${target.display_name}.`});
});

app.post("/api/team-invites/:id/accept", auth, csrf, profileRequired, (req,res)=>{
  const invite=db.prepare("SELECT * FROM team_invites WHERE id=? AND invited_player_id=? AND status='PENDING'").get(req.params.id,req.account.player_id);
  if(!invite) return res.status(404).json({error:"Invitation not found or already handled."});
  const team=getTeam(invite.team_id);
  if(!team || team.status!=="OPEN" || team.count>=5) return res.status(409).json({error:"This team is no longer accepting players."});
  if(activeTeamForPlayer(req.account.player_id)) return res.status(409).json({error:"You are already in an active team."});
  const tx=db.transaction(()=>{
    db.prepare("INSERT INTO team_members(team_id,player_id) VALUES(?,?)").run(team.id,req.account.player_id);
    db.prepare("UPDATE team_invites SET status='ACCEPTED',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(invite.id);
    db.prepare("UPDATE team_invites SET status='DECLINED',responded_at=CURRENT_TIMESTAMP WHERE invited_player_id=? AND status='PENDING' AND id<>?").run(req.account.player_id,invite.id);
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
app.post("/api/teams/:id/queue", auth, csrf, profileRequired, (req,res)=>{const team=getTeam(req.params.id);if(!team)return res.status(404).json({error:"Team not found"});if(team.captain_id!==req.account.player_id)return res.status(403).json({error:"Only the captain can queue the team"});if(team.count!==5)return res.status(400).json({error:"Team must have 5 players"});db.prepare("UPDATE teams SET status='READY' WHERE id=?").run(team.id);db.prepare("INSERT OR IGNORE INTO queue(team_id) VALUES(?)").run(team.id);res.json({queued:true,team:getTeam(team.id)});});
app.get("/api/queue", (_,res)=>res.json(db.prepare(`SELECT t.id,t.name,t.region,t.min_level,t.max_level,COUNT(tm.player_id) count FROM queue q JOIN teams t ON t.id=q.team_id LEFT JOIN team_members tm ON tm.team_id=t.id GROUP BY t.id ORDER BY q.queued_at`).all()));
app.post("/api/matchmaking/run", auth, adminRequired, csrf, (_,res)=>res.json({matches:runMatchmaking()}));
app.get("/api/matches/:id", (req,res)=>{const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);if(!m)return res.status(404).json({error:"Match not found"});res.json({...m,team_a:getTeam(m.team_a_id),team_b:getTeam(m.team_b_id)});});
app.post("/api/matches/:id/accept", auth, csrf, profileRequired, (req,res)=>{if(!requireBody(req,res,["team_id"]))return;const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);if(!m)return res.status(404).json({error:"Match not found"});const teamId=Number(req.body.team_id);const team=getTeam(teamId);if(!team||team.captain_id!==req.account.player_id)return res.status(403).json({error:"Only the captain of the matched team can accept"});if(teamId===m.team_a_id)db.prepare("UPDATE matches SET accepted_a=1 WHERE id=?").run(m.id);else if(teamId===m.team_b_id)db.prepare("UPDATE matches SET accepted_b=1 WHERE id=?").run(m.id);else return res.status(403).json({error:"Team is not part of this match"});const updated=db.prepare("SELECT * FROM matches WHERE id=?").get(m.id);if(updated.accepted_a&&updated.accepted_b){db.prepare("UPDATE matches SET status='CONFIRMED' WHERE id=?").run(m.id);db.prepare("UPDATE teams SET status='MATCH_CONFIRMED' WHERE id IN (?,?)").run(m.team_a_id,m.team_b_id);}res.json(db.prepare("SELECT * FROM matches WHERE id=?").get(m.id));});

// True if both players were on either side of the same confirmed match.
function playedTogether(aId, bId) {
  return !!db.prepare(`
    SELECT 1 FROM matches m
    JOIN team_members x ON x.team_id IN (m.team_a_id, m.team_b_id) AND x.player_id=?
    JOIN team_members y ON y.team_id IN (m.team_a_id, m.team_b_id) AND y.player_id=?
    WHERE m.status='CONFIRMED' LIMIT 1`).get(aId, bId);
}

app.post("/api/trust", auth, csrf, profileRequired, (req,res)=>{if(!requireBody(req,res,["to_player_id","rating"]))return;const rating=Math.max(1,Math.min(5,Math.round(Number(req.body.rating))||0));req.body.to_player_id=Number(req.body.to_player_id);if(req.body.to_player_id===req.account.player_id)return res.status(400).json({error:"You cannot rate yourself"});if(!playedTogether(req.account.player_id,req.body.to_player_id))return res.status(403).json({error:"You can only rate players you have played a confirmed match with."});db.prepare(`INSERT INTO trust_ratings(from_player_id,to_player_id,rating,tags) VALUES(?,?,?,?) ON CONFLICT(from_player_id,to_player_id) DO UPDATE SET rating=excluded.rating,tags=excluded.tags`).run(req.account.player_id,req.body.to_player_id,rating,req.body.tags||"");const avgRow=db.prepare("SELECT AVG(rating) avg_rating FROM trust_ratings WHERE to_player_id=?").get(req.body.to_player_id);const score=Math.round((avgRow.avg_rating||3)*20);db.prepare("UPDATE players SET trust_score=? WHERE id=?").run(score,req.body.to_player_id);res.json({ok:true,trust_score:score});});


app.use("/assets", express.static(path.join(__dirname, "../public")));

app.get("/api/discover/teams", (_, res) => {
  const teams = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.region,
      t.min_level,
      t.max_level,
      t.status,
      COUNT(tm.player_id) AS count
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id=t.id
    WHERE t.status='OPEN'
    GROUP BY t.id
    HAVING count < 5
    ORDER BY t.created_at DESC
  `).all();

  res.json(teams);
});

app.get("/login", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/login.html")));
app.get("/forgot-password", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/forgot-password.html")));
app.get("/register", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/register.html")));
app.get("/", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/play", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/teams", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/players", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/matches", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/rankings", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/player/:username", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
app.get("/team/:id", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));

app.get("*splat", (_,res)=>res.sendFile(path.join(__dirname,"../public/pages/app.html")));
const port=Number(process.env.PORT||3000);app.listen(port,"0.0.0.0",()=>console.log(`STACK5 listening on ${port}`));
