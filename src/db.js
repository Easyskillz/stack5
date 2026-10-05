import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { COUNTRY_CATALOG } from "./regions.js";

const dbPath = process.env.DB_PATH || "./data/stack5.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_url TEXT UNIQUE NOT NULL,
  steam_id TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  faceit_level INTEGER DEFAULT 0,
  faceit_elo INTEGER DEFAULT 0,
  region TEXT DEFAULT 'EU',
  country TEXT,
  language TEXT DEFAULT 'EN',
  role TEXT DEFAULT 'Rifler',
  trust_score INTEGER DEFAULT 50,
  reliability_score INTEGER DEFAULT 50,
  teamplay_score INTEGER DEFAULT 50,
  availability TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  captain_id INTEGER NOT NULL,
  region TEXT DEFAULT 'EU',
  min_level INTEGER DEFAULT 1,
  max_level INTEGER DEFAULT 10,
  scheduled_at TEXT,
  status TEXT DEFAULT 'OPEN',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(captain_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(team_id, player_id),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue (
  team_id INTEGER PRIMARY KEY,
  queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_a_id INTEGER NOT NULL,
  team_b_id INTEGER NOT NULL,
  compatibility INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  scheduled_at TEXT,
  accepted_a INTEGER DEFAULT 0,
  accepted_b INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(team_a_id) REFERENCES teams(id),
  FOREIGN KEY(team_b_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS trust_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_player_id INTEGER NOT NULL,
  to_player_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_player_id, to_player_id),
  FOREIGN KEY(from_player_id) REFERENCES players(id),
  FOREIGN KEY(to_player_id) REFERENCES players(id)
);
`);

try { db.exec("ALTER TABLE players ADD COLUMN country TEXT"); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  email_verified INTEGER DEFAULT 0,
  verification_token_hash TEXT,
  verification_expires_at INTEGER,
  terms_accepted_at TEXT,
  player_id INTEGER UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_steam_id TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  invited_player_id INTEGER NOT NULL,
  invited_by_player_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  UNIQUE(team_id, invited_player_id),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by_player_id) REFERENCES players(id) ON DELETE CASCADE
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS team_join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  UNIQUE(team_id, player_id),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);
`);

db.exec(`
-- Identity data pulled from Steam / FACEIT (refreshed periodically).
CREATE TABLE IF NOT EXISTS player_external (
  player_id INTEGER PRIMARY KEY,
  steam_id64 TEXT,
  steam_visibility INTEGER,
  steam_created_at INTEGER,
  steam_level INTEGER,
  cs2_minutes INTEGER,
  vac_bans INTEGER,
  game_bans INTEGER,
  days_since_last_ban INTEGER,
  community_banned INTEGER,
  steam_fetched_at INTEGER,
  steam_error TEXT,
  faceit_id TEXT,
  faceit_nickname TEXT,
  faceit_level INTEGER,
  faceit_elo INTEGER,
  faceit_matches INTEGER,
  faceit_activated_at INTEGER,
  faceit_bans TEXT,
  faceit_fetched_at INTEGER,
  faceit_error TEXT,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Behaviour log used by the reliability part of the trust score.
CREATE TABLE IF NOT EXISTS player_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref_id INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_events_player ON player_events(player_id);
`);

// Lightweight migrations for existing beta databases.
for (const col of [
  "trust_confidence TEXT DEFAULT 'NEW'",
  "trust_breakdown TEXT",
  "trust_updated_at INTEGER",
  "faceit_verified INTEGER DEFAULT 0"
]) { try { db.exec(`ALTER TABLE players ADD COLUMN ${col}`); } catch {} }
for (const col of [
  "eligible INTEGER DEFAULT 0",
  "eligibility TEXT",
  "eligibility_checked_at INTEGER",
  "eligibility_override INTEGER",      // NULL = automatic, 1 = admin-approved, 0 = admin-blocked
  "deleted_at INTEGER"                 // set when the owner deletes their account (row is anonymised)
]) { try { db.exec(`ALTER TABLE players ADD COLUMN ${col}`); } catch {} }
try { db.exec("ALTER TABLE teams ADD COLUMN last_activity_at INTEGER"); } catch {}
// Steam ownership: proven via "Sign in through Steam" (OpenID), never by a pasted URL.
try { db.exec("ALTER TABLE players ADD COLUMN steam_verified INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE players ADD COLUMN steam_verified_at INTEGER"); } catch {}
try { db.exec("ALTER TABLE accounts ADD COLUMN verified_steam_id TEXT"); } catch {}
// FACEIT data is live-only (FACEIT API terms 5.4): wipe anything an earlier version stored.
db.exec(`UPDATE player_external SET faceit_id=NULL, faceit_nickname=NULL, faceit_level=NULL, faceit_elo=NULL, faceit_matches=NULL,
  faceit_activated_at=NULL, faceit_bans=NULL, faceit_fetched_at=NULL, faceit_error=NULL WHERE faceit_fetched_at IS NOT NULL OR faceit_id IS NOT NULL`);
try { db.exec("ALTER TABLE trust_ratings ADD COLUMN match_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE matches ADD COLUMN declined_by_team_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); } catch {}

// Steam is the only way to sign in: email becomes optional and passwords are no longer stored.
// SQLite can't drop NOT NULL in place, so the accounts table is rebuilt once (standard 12-step recipe).
if (db.prepare("SELECT \"notnull\" FROM pragma_table_info('accounts') WHERE name='email'").get()?.notnull) {
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(`CREATE TABLE accounts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      email_verified INTEGER DEFAULT 0,
      verification_token_hash TEXT,
      verification_expires_at INTEGER,
      terms_accepted_at TEXT,
      player_id INTEGER UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_steam_id TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE SET NULL
    )`);
    db.exec(`INSERT INTO accounts_new(id,username,email,email_verified,verification_token_hash,verification_expires_at,terms_accepted_at,player_id,created_at,verified_steam_id,is_admin)
      SELECT id,username,email,email_verified,verification_token_hash,verification_expires_at,terms_accepted_at,player_id,created_at,verified_steam_id,is_admin FROM accounts`);
    db.exec("DROP TABLE accounts");
    db.exec("ALTER TABLE accounts_new RENAME TO accounts");
    // Sign-in states now also exist before an account does (first Steam sign-in).
    db.exec("DROP TABLE IF EXISTS steam_auth_states");
    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw new Error(`accounts migration left ${broken.length} broken reference(s)`);
  })();
  db.pragma("foreign_keys = ON");
}
db.exec(`CREATE TABLE IF NOT EXISTS steam_auth_states (
  state TEXT PRIMARY KEY,
  account_id INTEGER,                 -- set when an already signed-in account links Steam
  created_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
)`);
// First Steam sign-in: the proven SteamID waits here while the player picks a username.
db.exec(`CREATE TABLE IF NOT EXISTS steam_signups (
  token_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
// Match room: CS2 private matchmaking code + result reporting.
// Status flow: PENDING -> CONFIRMED (live) -> COMPLETED | DISPUTED -> COMPLETED | NO_RESULT.
for (const col of [
  "confirmed_at INTEGER",
  "lobby_code TEXT",                 // CS2 private matchmaking pool code; only the 10 players see it
  "lobby_code_by INTEGER",           // player id of the captain who posted it
  "report_a TEXT",                   // "13-9" as reported by team A's captain (team A score first)
  "report_b TEXT",                   // same, reported by team B's captain, also team A score first
  "reported_a_at INTEGER",
  "reported_b_at INTEGER",
  "score_a INTEGER",
  "score_b INTEGER",
  "completed_at INTEGER",
  "voice_a TEXT",                    // optional Discord invite for team A's voice channel; only team A sees it
  "voice_b TEXT"                     // same for team B
]) { try { db.exec(`ALTER TABLE matches ADD COLUMN ${col}`); } catch {} }
// Last activity, only used to count players online (never shown per player).
try { db.exec("ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER"); } catch {}
// CS2 Premier rating (self-reported, 0 = no rating yet) replaces the FACEIT level for teams and matchmaking.
try { db.exec("ALTER TABLE players ADD COLUMN premier_rating INTEGER"); } catch {}
try { db.exec("ALTER TABLE teams ADD COLUMN min_rating INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE teams ADD COLUMN max_rating INTEGER DEFAULT 40000"); } catch {}
// Players can speak several languages ("FR,AR,EN"); the first one is also kept in `language` (flags, older code).
try { db.exec("ALTER TABLE players ADD COLUMN languages TEXT"); } catch {}
// Where the Premier rating came from: 'leetify' (copied, kept in sync) or 'self' (typed by the player, always wins).
try { db.exec("ALTER TABLE players ADD COLUMN premier_source TEXT"); } catch {}
// After a completed match, players vote 👍/👎 on aspects of each other (not skill: that's the Premier rating).
// One vote per voter, player, match and aspect; changeable during the voting window.
db.exec(`CREATE TABLE IF NOT EXISTS player_votes (
  match_id INTEGER NOT NULL,
  from_player_id INTEGER NOT NULL,
  to_player_id INTEGER NOT NULL,
  aspect TEXT NOT NULL CHECK(aspect IN ('comms','teamplay','attitude','sportsmanship')),
  vote INTEGER NOT NULL CHECK(vote IN (-1,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(match_id, from_player_id, to_player_id, aspect)
)`);
db.exec("CREATE INDEX IF NOT EXISTS idx_votes_to ON player_votes(to_player_id)");
try { db.exec("ALTER TABLE players ADD COLUMN premier_synced_at INTEGER"); } catch {}
// The Premier rating now only comes from Leetify: ratings players typed are removed (the daily job refills from Leetify).
db.exec("UPDATE players SET premier_rating=NULL, premier_source=NULL, premier_synced_at=NULL WHERE premier_source='self' OR (premier_rating IS NOT NULL AND premier_source IS NULL)");
// Older (test) profiles stored country names ("France", "UK", "USA") instead of codes: convert them.
{
  const alias = { UK: "GB", USA: "US", "United States of America": "US" };
  db.prepare("UPDATE players SET country='GB' WHERE country='UK'").run();
  for (const p of db.prepare("SELECT id, country FROM players WHERE country IS NOT NULL AND length(country) > 2").all()) {
    const code = alias[p.country] || COUNTRY_CATALOG.find(c => c[1].toLowerCase() === p.country.toLowerCase())?.[0];
    if (code) db.prepare("UPDATE players SET country=? WHERE id=?").run(code, p.id);
  }
}
// Beta languages only (English, French, Spanish, Portuguese): drop the others from profiles.
for (const p of db.prepare("SELECT id, languages FROM players WHERE languages IS NOT NULL").all()) {
  const keep = p.languages.split(",").filter(c => ["EN", "FR", "ES", "PT"].includes(c));
  if (keep.join(",") !== p.languages) db.prepare("UPDATE players SET languages=?, language=? WHERE id=?").run(keep.join(",") || null, keep[0] || null, p.id);
}
db.exec("UPDATE players SET languages=language WHERE languages IS NULL AND language IS NOT NULL AND language<>''");
// The self-reported FACEIT level/Elo is no longer collected or used: clear what older versions stored.
db.exec("UPDATE players SET faceit_level=0, faceit_elo=0 WHERE faceit_level<>0 OR faceit_elo<>0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_steam ON accounts(verified_steam_id) WHERE verified_steam_id IS NOT NULL");

export function getTeamMembers(teamId) {
  return db.prepare(`
    SELECT p.* FROM players p
    JOIN team_members tm ON tm.player_id = p.id
    WHERE tm.team_id = ?
    ORDER BY tm.joined_at
  `).all(teamId);
}

export function getTeam(teamId) {
  const team = db.prepare(`SELECT * FROM teams WHERE id=?`).get(teamId);
  if (!team) return null;
  team.members = getTeamMembers(teamId);
  team.count = team.members.length;
  return team;
}
