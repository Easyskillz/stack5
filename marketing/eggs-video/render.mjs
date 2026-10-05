// Renders video.html frame by frame (render(t)) in headless Chrome and encodes an MP4 with ffmpeg.
// usage: node render.mjs <out.mp4> [--lang fr] [--preview t1,t2,...]  (preview writes PNG stills instead)
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");   // npm install ffmpeg-static (in this folder, not the app)
const out = process.argv[2];
const previewArg = process.argv.indexOf("--preview");
const preview = previewArg > 0 ? process.argv[previewArg + 1].split(",").map(Number) : null;
const langArg = process.argv.indexOf("--lang");
const lang = langArg > 0 ? process.argv[langArg + 1] : "en";
const FPS = 30, W = 1080, H = 1920;
let DUR = 20;   // read from the page (window.DUR) once loaded
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP || process.env.TMPDIR || "/tmp"}/video-prof-${port}`, "about:blank"]);
try {
  let tg; for (let i = 0; i < 50 && !tg; i++) { await sleep(200); try { tg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === "page"); } catch {} }
  const ws = new WebSocket(tg.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable"); await send("Page.navigate", { url: "file:///" + path.join(here, "video.html").replace(/\\/g, "/") + "?lang=" + lang });
  await sleep(1500); await send("Runtime.evaluate", { expression: "ready", awaitPromise: true });
  DUR = (await send("Runtime.evaluate", { expression: "window.DUR", returnByValue: true })).result.result.value || DUR;
  const frame = async (t, format) => { await send("Runtime.evaluate", { expression: `render(${t})` }); return Buffer.from((await send("Page.captureScreenshot", { format, quality: format === "jpeg" ? 92 : undefined })).result.data, "base64"); };
  if (preview) {
    for (const t of preview) { fs.writeFileSync(`${out}-${t}.png`, await frame(t, "png")); console.log(`still ${t}s`); }
  } else {
    const ff = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
    let err = ""; ff.stderr.on("data", d => err += d);
    const total = FPS * DUR;
    for (let f = 0; f < total; f++) {
      const buf = await frame(f / FPS, "jpeg");
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
      if (f % 150 === 0) console.log(`frame ${f}/${total}`);
    }
    ff.stdin.end();
    const code = await new Promise(r => ff.on("close", r));
    if (code !== 0) throw new Error("ffmpeg failed:\n" + err.slice(-1500));
    console.log(`done: ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  }
  ws.close();
} finally { chrome.kill(); }
