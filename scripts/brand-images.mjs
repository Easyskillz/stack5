// Regenerates the brand images: public/og.png (1200x630 link preview), public/apple-touch-icon.png (512x512)
// and public/favicon.svg. Edit NAME/TAGLINE below, then run: node scripts/brand-images.mjs   (needs Google Chrome)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = process.env.TEMP || process.env.TMPDIR || "/tmp";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NAME = ["Clean", "Lobby"];      // second part is yellow, like the site logo
const MONO = ["C", "L"];              // icon letters
const BG = "#0c0c0e", ACCENT = "#ffc53d", RED = "#ff4b3e", MUTED = "#a29e94";
// CS2 Premier tier colours, the stripe under the site header
const TIERS = ["#b0c3d9", "#6fb6ff", "#6b8bff", "#a070ff", "#e15cf0", "#ff5a5a", "#ffd34d"];
const STRIPE = `linear-gradient(90deg,${TIERS.map((c, i) => `${c} ${(i * 100 / 7).toFixed(2)}% ${((i + 1) * 100 / 7).toFixed(2)}%`).join(",")})`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const font = f => `data:font/woff2;base64,${fs.readFileSync(`${REPO}/public/fonts/${f}`).toString("base64")}`;
const css = `@font-face{font-family:Inter;src:url(${font("inter-latin.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Anton;src:url(${font("anton-latin.woff2")}) format("woff2")}
*{margin:0;box-sizing:border-box}body{background:${BG};font-family:Inter,Arial,sans-serif;color:#f6f3ec;overflow:hidden}`;

const egg = `<svg width="300" height="300" viewBox="0 0 400 400"><defs><radialGradient id="s" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#f4ecdc"/><stop offset="1" stop-color="#cdbb98"/></radialGradient><clipPath id="c"><path d="M200 82c62 0 104 106 104 170 0 62-46 104-104 104S96 314 96 252C96 188 138 82 200 82z"/></clipPath></defs>
<circle cx="200" cy="200" r="186" fill="none" stroke="#a070ff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="2 10"/><circle cx="200" cy="200" r="158" fill="none" stroke="#6b8bff" stroke-opacity=".4" stroke-width="1.5" stroke-dasharray="40 14"/>
<path d="M200 82c62 0 104 106 104 170 0 62-46 104-104 104S96 314 96 252C96 188 138 82 200 82z" fill="url(#s)"/><g clip-path="url(#c)"><path d="M86 214l30 14 18-24 22 30 20-28 24 26 22-30 22 28 20-22 26 18 18-10" fill="none" stroke="#2b2620" stroke-width="5" stroke-linejoin="round"/></g>
<g stroke="${ACCENT}" stroke-width="3"><line x1="200" y1="0" x2="200" y2="60"/><line x1="200" y1="340" x2="200" y2="400"/><line x1="0" y1="200" x2="60" y2="200"/><line x1="340" y1="200" x2="400" y2="200"/></g></svg>`;

const og = `<style>${css}
.wrap{position:relative;width:1200px;height:630px;padding:64px 72px;background:radial-gradient(circle at 84% 40%,rgba(160,112,255,.22),rgba(107,139,255,.08) 30%,transparent 52%),${BG}}
.wrap::after{content:"";position:absolute;left:0;right:0;bottom:0;height:12px;background:${STRIPE}}
.logo{font-size:38px;font-weight:800;letter-spacing:-.05em}.logo span,.y{color:${ACCENT}}
.eye{margin-top:44px;font-size:20px;font-weight:800;letter-spacing:.16em;color:${ACCENT}}
h1{margin-top:14px;font-family:Anton,Impact,sans-serif;font-weight:400;text-transform:uppercase;line-height:.95}
.no{display:block;font-size:58px;color:${MUTED}}.eggs{position:relative;color:#f4ecdc}
.eggs::after{content:"";position:absolute;left:-4%;right:-4%;top:52%;height:7px;background:${RED};transform:rotate(-4deg);border-radius:4px}
.want{display:block;font-size:84px;margin-top:6px;max-width:740px}.want .y{white-space:nowrap}
.art{position:absolute;right:56px;top:150px}
.stamp{position:absolute;right:40px;top:372px;transform:rotate(-12deg);border:4px solid ${RED};color:${RED};font-family:Anton,Impact,sans-serif;font-size:28px;letter-spacing:.06em;padding:2px 12px;border-radius:8px;background:rgba(12,12,14,.8)}
</style><div class="wrap"><div class="logo">${NAME[0]}<span>${NAME[1]}</span></div>
<div class="eye">CS2 5V5 TEAM MATCHMAKING</div>
<h1><span class="no">We don't want <span class="eggs">eggs.</span></span><span class="want">We want a <span class="y">cheater-free</span> game.</span></h1>
<div class="art">${egg}</div><div class="stamp">NOT IN MY LOBBY</div></div>`;

const icon = `<style>${css}
.i{position:relative;width:512px;height:512px;display:flex;align-items:center;justify-content:center;font-size:250px;font-weight:900;letter-spacing:-.03em}
.i span{color:${ACCENT}}.i::after{content:"";position:absolute;left:0;right:0;bottom:0;height:40px;background:${STRIPE}}</style><div class="i">${MONO[0]}<span>${MONO[1]}</span></div>`;

async function render(html, width, height, out) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${SCRATCH}/chrome-brand-${port}`, "about:blank"]);
  try {
    let t; for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === "page"); } catch {} }
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.enable");
    const { result } = await send("Page.getFrameTree");
    await send("Page.setDocumentContent", { frameId: result.frameTree.frame.id, html: `<!doctype html><meta charset="utf-8">${html}` });
    await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true }); await sleep(300);
    const img = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(out, Buffer.from(img.result.data, "base64"));
    console.log(`  ${path.relative(REPO, out)}  ${width}x${height}`);
    ws.close();
  } finally { chrome.kill(); }
}

await render(og, 1200, 630, `${REPO}/public/og.png`);
await render(icon, 512, 512, `${REPO}/public/apple-touch-icon.png`);
fs.writeFileSync(`${REPO}/public/favicon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/><text x="32" y="44" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="900" text-anchor="middle" letter-spacing="-2" fill="#f6f3ec">${MONO[0]}<tspan fill="${ACCENT}">${MONO[1]}</tspan></text></svg>\n`);
console.log("  public/favicon.svg");
process.exit(0);
