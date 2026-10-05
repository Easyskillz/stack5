# French version

The whole site is available in French under **`/fr`** (`cleanlobby.com/fr`, `/fr/teams`, `/fr/guide`, …), with a 🇺🇸 EN / 🇫🇷 FR switch in the header of every page. The English site is unchanged at the same addresses without `/fr`.

## How it works

- **Same app, translated in the browser.** The pages are written in English in `public/app.js`. On `/fr`, the server adds `<script src="/i18n/fr.js">` (the dictionary, `window.CL_FR`), and `app.js` replaces every text fragment, placeholder and tooltip with its French version as soon as it appears (a `MutationObserver`, before the browser paints, so there is no flash of English). Server messages shown in toasts are translated the same way.
- **Dictionary keys** are the exact English text of one fragment between HTML tags, or a whole server message. `{x}` matches any value (`"{x} votes · {x}% 👍"`). A translation starting with `.` or `,` sticks to the previous word.
- **Never translated:** the logo, and player and team names (`nm()` in `app.js` wraps names in `data-no-i18n`).
- **Links** inside the French site stay on `/fr` automatically (except API, Steam sign-in and static files).
- **Menu:** shorter French labels in the header (Équipes, Joueurs) so it fits on one line.
- **Separate French files:** `public/pages/login.fr.html`, `welcome.fr.html`, `terms.fr.html`, `privacy.fr.html`. Terms and Privacy say the English version prevails if the two differ.
- **Remembering the language:** cookie `cl_lang` (`en` or `fr`, 1 year), set by every page and by the switch, so Steam sign-in sends the player back to `/fr/play` or `/fr/welcome`. Listed in the Privacy Policy.
- **SEO:** French titles and descriptions (`PAGES_FR` in `src/server.js`), `<html lang="fr">`, `og:locale fr_FR`, French crawler text (`public/pages/static.fr.html`), `hreflang` links between the two versions on every page, and both versions in `sitemap.xml`.

## Keeping it complete

When you add or change English text, add the French line to `public/i18n/fr.js`, then:

- `node scripts/i18n-extract.mjs` lists strings found in the code with no French translation (it also lists code strings, which can be ignored).
- `I18N_AUDIT=1 node scripts/guide-screenshots.mjs` plays a full match on the `/fr` pages and lists text that still looks English (written to `%TEMP%/i18n-audit.json`). Known false alarms: the CS2 menu path "Play → Matchmaking → …" (kept as in the game), French sentences containing "fair-play" or "matchmaking", flag tooltips.

Emails (verification, contact form) stay in English.
