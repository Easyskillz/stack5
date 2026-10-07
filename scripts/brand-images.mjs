// Regenerates the brand images: public/og.png (1200x630 link preview), public/apple-touch-icon.png (512x512)
// and public/favicon.svg. Edit NAME/TAGLINE below, then run: node scripts/brand-images.mjs   (needs Google Chrome)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = process.env.TEMP || process.env.TMPDIR || "/tmp";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NAME = ["Clean", "Lobby"];      // second part is green, like the site logo
const MONO = ["C", "L"];              // icon letters
const BG = "#080b0a", ACCENT = "#55e36b", MUTED = "#8e9b94";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const font = f => `data:font/woff2;base64,${fs.readFileSync(`${REPO}/public/fonts/${f}`).toString("base64")}`;
const css = `@font-face{font-family:Inter;src:url(${font("inter-latin.woff2")}) format("woff2");font-weight:100 900}
*{margin:0;box-sizing:border-box}body{background:${BG};font-family:Inter,Arial,sans-serif;color:#f2f5f3;overflow:hidden}`;

const og = `<style>${css}
.wrap{position:relative;width:1200px;height:630px;padding:72px 80px;background:radial-gradient(circle at 85% 20%,rgba(85,227,107,.14),transparent 45%),${BG};border-bottom:10px solid ${ACCENT}}
.logo{font-size:40px;font-weight:800;letter-spacing:-.05em}.logo span,.y{color:${ACCENT}}
.eye{margin-top:70px;font-size:20px;font-weight:800;letter-spacing:.16em;color:${ACCENT}}
h1{margin-top:16px;font-size:86px;font-weight:800;line-height:1.02;letter-spacing:-.055em}
.sub{margin-top:28px;font-size:28px;color:${MUTED}}
</style><div class="wrap"><div class="logo">${NAME[0]}<span>${NAME[1]}</span></div>
<div class="eye">CS2 5V5 TEAM MATCHMAKING</div>
<h1>Tired of cheaters?<br><span class="y">Find a trusted five.</span></h1>
<div class="sub">Steam-verified 5-stacks · Premier rating · public Trust Score</div></div>`;

const icon = `<style>${css}
.i{width:512px;height:512px;display:flex;align-items:center;justify-content:center;font-size:250px;font-weight:900;letter-spacing:-.03em}
.i span{color:${ACCENT}}</style><div class="i">${MONO[0]}<span>${MONO[1]}</span></div>`;

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
fs.writeFileSync(`${REPO}/public/favicon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/><text x="32" y="44" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="900" text-anchor="middle" letter-spacing="-2" fill="#f2f5f3">${MONO[0]}<tspan fill="${ACCENT}">${MONO[1]}</tspan></text></svg>\n`);
console.log("  public/favicon.svg");
process.exit(0);
