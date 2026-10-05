// Lists the English text the site shows, so the French dictionary (public/i18n/fr.js) can be kept complete.
// usage: node scripts/i18n-extract.mjs            -> prints strings that have no French translation yet
//        node scripts/i18n-extract.mjs --all      -> prints every string found
// Fragments come from public/app.js (text between HTML tags, ${...} becomes {x}) and from the
// error/message strings the server sends (src/*.js), which the browser shows in toasts and panels.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const looksLikeText = s => /[A-Za-z]{2}/.test(s) && !/[{};=]|=>|\bvar\(|^[a-z0-9-]+$|^[a-z]+(\s[a-z-]+)*$|^#|^\.|^\/|https?:|\.(js|css|svg|webp|png)\b/.test(s.replace(/\{x\}/g, ""))
  && !/^(GET|POST|PUT|DELETE)\b/.test(s);

// Replace ${...} (balanced braces, nested templates) with a marker.
function stripInterpolations(src) {
  let out = "", i = 0;
  while (i < src.length) {
    if (src[i] === "$" && src[i + 1] === "{") {
      let depth = 1, j = i + 2;
      while (j < src.length && depth) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; j++; }
      out += "\u0000"; i = j;
    } else out += src[i++];
  }
  return out;
}

const found = new Set();
const add = s => { s = norm(s.replace(/\u0000/g, "{x}")); if (s && looksLikeText(s)) found.add(s); };

// 1) app.js: text between tags, in every string literal kind
const app = stripInterpolations(fs.readFileSync(path.join(REPO, "public/app.js"), "utf8"));
for (const m of app.matchAll(/`([^`]*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
  const lit = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\'/g, "'");
  for (const part of lit.split(/<[^>]*>/)) add(part);
  for (const a of lit.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) add(a[1]);
}
// 2) server messages
for (const f of ["src/server.js", "src/matches.js", "src/eligibility.js", "src/trust.js", "src/timers.js", "src/steam-auth.js"]) {
  const src = stripInterpolations(fs.readFileSync(path.join(REPO, f), "utf8"));
  for (const m of src.matchAll(/(?:error|message|label|detail|notes\.push|flags\.push)\s*[:(]\s*(?:`([^`]*)`|"((?:[^"\\]|\\.)*)")/g)) add(m[1] ?? m[2]);
}

const all = process.argv.includes("--all");
let fr = {};
{ const win = {}; new Function("window", fs.readFileSync(path.join(REPO, "public/i18n/fr.js"), "utf8"))(win);   // fr.js sets window.CL_FR
  fr = Object.fromEntries(Object.entries(win.CL_FR || {}).map(([k, v]) => [norm(k), v])); }
const list = [...found].sort().filter(s => all || !(s in fr));
console.log(list.map(s => JSON.stringify(s)).join("\n"));
console.error(`${list.length} ${all ? "strings" : "strings without a French translation"} (of ${found.size})`);
