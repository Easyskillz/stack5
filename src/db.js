import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

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
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  verification_token_hash TEXT,
  verification_expires_at INTEGER,
  terms_accepted_at TEXT,
  player_id INTEGER UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

// Lightweight migrations for existing beta databases.
try { db.exec("ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE accounts ADD COLUMN reset_token_hash TEXT"); } catch {}
try { db.exec("ALTER TABLE accounts ADD COLUMN reset_expires_at INTEGER"); } catch {}

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
