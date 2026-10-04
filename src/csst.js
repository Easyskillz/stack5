/**
 * CSST integration boundary.
 *
 * We deliberately do not scrape csst.at.
 * If CSST exposes an authorized API/feed, implement it here.
 *
 * Expected input: public Steam profile URL.
 * Expected output: normalized player intelligence object.
 */

export function normalizeSteamUrl(value) {
  if (!value) throw new Error("Steam profile URL is required");
  const url = new URL(value);
  if (url.hostname !== "steamcommunity.com" && url.hostname !== "www.steamcommunity.com") {
    throw new Error("Only steamcommunity.com profile URLs are accepted");
  }
  if (!url.pathname.startsWith("/id/") && !url.pathname.startsWith("/profiles/")) {
    throw new Error("Use a Steam custom URL or /profiles/<steamid> URL");
  }
  return url.toString().replace(/\/$/, "");
}

export async function lookupCSST(steamUrl) {
  const normalized = normalizeSteamUrl(steamUrl);

  // TODO: replace with an authorized CSST API call once credentials/API contract are available.
  return {
    source: "steam-url",
    steam_url: normalized,
    csst_available: false,
    note: "CSST adapter ready; authorized API endpoint not configured."
  };
}
