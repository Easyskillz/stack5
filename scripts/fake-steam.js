/**
 * Local development only: a stand-in for Steam's OpenID sign-in, so "Sign in through Steam"
 * can be tested without real Steam accounts.
 *
 *   node scripts/fake-steam.js                     (listens on http://localhost:3999)
 *   STEAM_OPENID_ENDPOINT=http://localhost:3999/openid/login npm start
 *
 * The sign-in page asks which SteamID64 to "sign in" as. Never point production at this.
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_STEAM_PORT || 3999);
const ENDPOINT = `http://localhost:${PORT}/openid/login`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

http.createServer((req, res) => {
  const url = new URL(req.url, ENDPOINT);
  if (url.pathname !== "/openid/login") { res.writeHead(404).end(); return; }

  if (req.method === "POST") {                 // check_authentication: every assertion we issued is valid
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
    return;
  }

  const q = url.searchParams;
  const steamId = q.get("steamid");
  if (q.get("openid.mode") === "checkid_setup" && /^\d{17}$/.test(steamId || "")) {
    const id = `https://steamcommunity.com/openid/id/${steamId}`;
    const back = new URL(q.get("openid.return_to"));
    for (const [k, v] of Object.entries({
      "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res", "openid.op_endpoint": ENDPOINT,
      "openid.claimed_id": id, "openid.identity": id, "openid.return_to": q.get("openid.return_to"),
      "openid.response_nonce": `${new Date().toISOString().slice(0, 19)}Zfake`, "openid.assoc_handle": "fake",
      "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle", "openid.sig": "fake"
    })) back.searchParams.set(k, v);
    res.writeHead(302, { Location: back.toString() }).end();
    return;
  }

  const hidden = [...q].filter(([k]) => k !== "steamid").map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  res.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><title>Fake Steam</title>
<body style="font-family:sans-serif;background:#1b2838;color:#fff;padding:40px">
<h2>Fake Steam sign-in (local development)</h2>
<form>${hidden}<label>Sign in as SteamID64 <input name="steamid" value="76561198000000001" pattern="\\d{17}" required></label>
<button>Sign in</button></form></body>`);
}).listen(PORT, () => console.log(`Fake Steam OpenID on ${ENDPOINT}`));
