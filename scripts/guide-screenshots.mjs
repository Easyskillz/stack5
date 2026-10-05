// Regenerates the player-guide screenshots (public/img/guide/*.webp): plays one full match on a
// throwaway local CleanLobby with fictional example players and captures each step.
// usage: node scripts/guide-screenshots.mjs   (needs Google Chrome; uses scripts/fake-steam.js)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = process.env.TEMP || process.env.TMPDIR || "/tmp";   // throwaway DB and browser profiles
const OUT = `${REPO}/public/img/guide`;
const DB = `${SCRATCH}/guide.db`;
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const Database = createRequire(`${REPO}/package.json`)("better-sqlite3");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
function start(script, port, env) {
  const p = spawn(process.execPath, [script], { cwd: REPO, env: { ...process.env, ...env } });
  let out = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d); procs.push(p);
  return new Promise((res, rej) => { const iv = setInterval(() => { if (/listening|OpenID on/.test(out)) { clearInterval(iv); res(); } }, 50); p.on("exit", c => rej(new Error(out))); });
}
const B = "http://localhost:3120";

function browser() {
  const jar = {}; let csrf = null;
  const store = res => { for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); const val = v.join("="); if (/Max-Age=0/.test(c) || !val) delete jar[k]; else jar[k] = val; } };
  const req = async (url, opt = {}) => { const r = await fetch(url.startsWith("http") ? url : B + url, { ...opt, redirect: "manual", headers: { ...(opt.headers || {}), cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") } }); store(r); return r; };
  const b = {
    jar,
    async post(url, body = {}) { const r = await req(url, { method: "POST", headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, body: JSON.stringify(body) }); return r.json().catch(() => ({})); },
    async get(url) { return (await req(url)).json(); },
    async steamToWelcome(steamId) { let r = await req("/auth/steam/start"); r = await req(r.headers.get("location") + "&steamid=" + steamId); await req(r.headers.get("location")); },
    async signup(username) { const s = await b.post("/api/auth/signup", { username, terms: true }); csrf = s.csrf_token; },
    async profile(role, rating, country = "MA", lang = "FR") { return b.post("/api/profile", { country, region: "NAFR", premier_rating: rating, role, language: lang }); }
  };
  return b;
}

// One CDP session per screenshot: emulate width, set cookies, clip to an element.
async function shot(name, url, selector, cookies = {}, { width = 1100, pad = 12 } = {}) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${SCRATCH}/chrome-guide-${port}`, "about:blank"]);
  try {
    let t; for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === "page"); } catch {} }
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send("Network.enable");
    for (const [n, v] of Object.entries(cookies)) await send("Network.setCookie", { name: n, value: v, url: B });
    await send("Page.enable"); await send("Page.navigate", { url: B + url }); await sleep(2500);
    const rect = (await send("Runtime.evaluate", { returnByValue: true, expression: `(()=>{document.querySelector('.toast')?.remove();const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()` })).result.result.value;
    if (!rect) throw new Error(`${name}: selector ${selector} not found`);
    const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: Math.min(width, rect.w + pad * 2), height: rect.h + pad * 2, scale: 1 };
    const img = await send("Page.captureScreenshot", { format: "webp", quality: 82, clip, captureBeyondViewport: true });
    fs.writeFileSync(`${OUT}/${name}.webp`, Buffer.from(img.result.data, "base64"));
    console.log(`  ${name}.webp  ${Math.round(clip.width)}x${Math.round(clip.height)}  ${Math.round(fs.statSync(`${OUT}/${name}.webp`).size / 1024)} KB`);
    ws.close();
  } finally { chrome.kill(); }
}

try {
  const env = { PORT: "3120", DB_PATH: DB, NODE_ENV: "test", PUBLIC_BASE_URL: B, TIMERS_INTERVAL_SECONDS: "0", MATCHMAKING_INTERVAL_SECONDS: "1",
    STEAM_API_KEY: "", FACEIT_API_KEY: "", SMTP_HOST: "", STACK5_ELIGIBILITY: "off", STEAM_OPENID_ENDPOINT: "http://localhost:3999/openid/login" };
  await start("scripts/fake-steam.js", 3999, {});
  await start("src/server.js", 3120, env);

  console.log("screenshots:");
  await shot("1-sign-in", "/login", ".card");

  const roles = ["IGL", "AWPer", "Entry", "Support", "Lurker"];
  const A = ["atlas_igl", "nizar_awp", "kenzo", "rif_entry", "samy"], Bn = ["medina_igl", "yanis", "walid_awp", "lotfi", "anis"];
  const players = [];
  // First player: stop at /welcome for the username screenshot.
  const first = browser(); await first.steamToWelcome("76561198000002001");
  await shot("2-pick-username", "/welcome", ".card", first.jar);
  await first.signup(A[0]);
  await shot("3-profile-setup", "/play", "#play .panel", first.jar);
  await first.profile(roles[0], 16850);
  players.push(first);
  for (let i = 1; i < 10; i++) {
    const b = browser(); await b.steamToWelcome(`765611980000020${String(i + 1).padStart(2, "0")}`);
    const name = i < 5 ? A[i] : Bn[i - 5];
    await b.signup(name); await b.profile(roles[i % 5], [9800, 13420, 17950, 21300, 26700, 31250][i % 6], i < 5 ? "MA" : "DZ", i < 5 ? "FR" : "AR"); players.push(b);
  }
  // Realistic Steam history for trust scores (fictional numbers).
  const db = new Database(DB);
  db.prepare("UPDATE accounts SET is_admin=1 WHERE username=?").run(A[0]);
  for (const r of db.prepare("SELECT id FROM players").all()) {
    db.prepare(`INSERT OR REPLACE INTO player_external(player_id,steam_id64,steam_visibility,steam_created_at,steam_level,cs2_minutes,vac_bans,game_bans,community_banned,steam_fetched_at)
      VALUES(?,?,3,?,?,?,0,0,0,?)`).run(r.id, "x", Date.now() - (4 + r.id % 6) * 365 * 864e5, 20 + r.id * 3, (1400 + r.id * 230) * 60, Date.now());
  }
  db.close();

  // Team building: captain + 2 members, invite form visible.
  const ta = await players[0].post("/api/teams", { name: "Atlas Five" });
  for (const k of [1, 2]) { await players[0].post(`/api/teams/${ta.id}/invite`, { username: A[k] }); const inv = (await players[k].get("/api/my/dashboard")).invites[0]; await players[k].post(`/api/team-invites/${inv.id}/accept`); }
  await players[0].post("/api/admin/trust/recompute");
  await shot("4-build-team", "/play", ".panel-grid", players[0].jar);
  for (const k of [3, 4]) { await players[0].post(`/api/teams/${ta.id}/invite`, { username: A[k] }); const inv = (await players[k].get("/api/my/dashboard")).invites[0]; await players[k].post(`/api/team-invites/${inv.id}/accept`); }
  const tb = await players[5].post("/api/teams", { name: "Medina Five" });
  for (const k of [6, 7, 8, 9]) { await players[5].post(`/api/teams/${tb.id}/invite`, { username: Bn[k - 5] }); const inv = (await players[k].get("/api/my/dashboard")).invites[0]; await players[k].post(`/api/team-invites/${inv.id}/accept`); }
  await players[0].post("/api/admin/trust/recompute");
  await shot("5-full-team-queue", "/play", ".panel-grid > div:first-child .panel", players[0].jar);

  // Queue both; wait for the match.
  await players[0].post(`/api/teams/${ta.id}/queue`);
  await shot("6-searching", "/play", ".panel-grid > div:first-child .panel", players[0].jar);
  await players[5].post(`/api/teams/${tb.id}/queue`);
  let m; for (let i = 0; i < 40 && !m; i++) { await sleep(300); m = (await players[0].get("/api/my/dashboard")).match; }
  await shot("7-match-found", "/play", ".match-panel", players[0].jar);
  await players[0].post(`/api/matches/${m.id}/accept`, { team_id: m.my_team_id });
  const mb = (await players[5].get("/api/my/dashboard")).match;
  await players[5].post(`/api/matches/${mb.id}/accept`, { team_id: mb.my_team_id });
  await players[0].post(`/api/matches/${m.id}/code`, { code: "KQ7X-M2PL-9RTA-WB4E" });
  await players[0].post(`/api/matches/${m.id}/voice`, { link: "https://discord.gg/atlasfive" });
  await shot("8-match-room", "/play", ".match-panel", players[0].jar);

  await players[0].post(`/api/matches/${m.id}/result`, { my_score: 13, their_score: 10 });
  await players[5].post(`/api/matches/${mb.id}/result`, { my_score: 10, their_score: 13 });
  await players[1].post("/api/trust", { to_player_id: (await players[6].get("/api/me")).player.id, rating: 5 });
  await shot("9-result-and-ratings", "/play", ".match-panel", players[1].jar);
  await players[0].post("/api/admin/trust/recompute");
  await shot("10-trust-score", `/player/${A[1]}`, ".trust-panel", players[0].jar);
} catch (e) { console.error(e); process.exitCode = 1; }
finally { for (const p of procs) try { p.kill(); } catch {} }
