/**
 * "Sign in through Steam" (OpenID 2.0) — proves a player owns the Steam account they link.
 * The player logs in on steamcommunity.com; Steam sends them back with a signed assertion,
 * which we confirm directly with Steam (check_authentication) before trusting the SteamID.
 * We never see the player's Steam password.
 */
const NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
export const steamOpenIdEndpoint = () => process.env.STEAM_OPENID_ENDPOINT || "https://steamcommunity.com/openid/login";
export const steamVerificationEnabled = () => process.env.STEAM_VERIFICATION !== "off";

export function steamLoginUrl(returnTo, realm) {
  const p = new URLSearchParams({
    "openid.ns": NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT
  });
  return `${steamOpenIdEndpoint()}?${p}`;
}

/**
 * Validate Steam's response. `params` = the openid.* query parameters Steam redirected back with.
 * Returns the SteamID64 or throws with a user-safe message.
 */
export async function verifySteamAssertion(params, expectedReturnTo) {
  if (params.get("openid.mode") !== "id_res") throw new Error("Steam sign-in was cancelled.");
  if (params.get("openid.op_endpoint") !== steamOpenIdEndpoint()) throw new Error("Unexpected sign-in provider.");
  const returnTo = params.get("openid.return_to") || "";
  if (returnTo !== expectedReturnTo) throw new Error("Steam sign-in link doesn't match. Please try again.");
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(params.get("openid.claimed_id") || "");
  if (!m) throw new Error("Steam didn't return a valid account.");

  // Ask Steam to confirm the signature: same parameters, mode switched to check_authentication.
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  const r = await fetch(steamOpenIdEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000)
  });
  const text = await r.text();
  if (!r.ok || !/^is_valid:true$/m.test(text)) throw new Error("Steam couldn't confirm this sign-in. Please try again.");
  return m[1];
}
