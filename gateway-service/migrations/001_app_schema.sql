-- Enable extensions for UUID generation if available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Existing base tables may already exist via schema.sql; extend them safely

-- Base tables (idempotent)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    subscription_status TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pgn TEXT NOT NULL,
    source TEXT,
    time_control TEXT,
    result TEXT,
    opponent_username TEXT,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT,
    plan_id TEXT,
    current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS repertoires (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pgn TEXT NOT NULL
);

-- Studies table for saved analysis sessions
CREATE TABLE IF NOT EXISTS studies (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pgn TEXT NOT NULL,
    current_fen TEXT NOT NULL,
    current_path TEXT NOT NULL,
    move_tree JSONB NOT NULL,
    messages JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games: add columns for normalized imports, ownership, and indexing
ALTER TABLE IF EXISTS games
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS rated BOOLEAN,
  ADD COLUMN IF NOT EXISTS perf TEXT,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination TEXT,
  ADD COLUMN IF NOT EXISTS opening_eco TEXT,
  ADD COLUMN IF NOT EXISTS opening_name TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS site TEXT,
  ADD COLUMN IF NOT EXISTS digest TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Unique index to deduplicate provider/source_id pairs
CREATE UNIQUE INDEX IF NOT EXISTS games_provider_source_id_uidx
  ON games(provider, source_id);

-- Digest index to avoid cross-provider duplicates
CREATE INDEX IF NOT EXISTS games_digest_idx ON games(digest);
CREATE INDEX IF NOT EXISTS games_user_idx ON games(user_id);
CREATE INDEX IF NOT EXISTS games_session_idx ON games(session_id);
CREATE INDEX IF NOT EXISTS games_created_idx ON games(created_at);
CREATE INDEX IF NOT EXISTS games_start_time_idx ON games(start_time);

-- Repertoires: add side, session ownership, created_at
ALTER TABLE IF EXISTS repertoires
  ADD COLUMN IF NOT EXISTS side TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Repertoire lines to store sequences and tags
CREATE TABLE IF NOT EXISTS repertoire_lines (
  id BIGSERIAL PRIMARY KEY,
  repertoire_id BIGINT REFERENCES repertoires(id) ON DELETE CASCADE,
  seq JSONB NOT NULL,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS repertoire_lines_rep_idx ON repertoire_lines(repertoire_id);

-- Imports grouping table
CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  source TEXT,
  username TEXT,
  filters JSONB,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS imports_owner_idx ON imports(COALESCE(user_id::text, session_id::text));

-- Raw games staging area
CREATE TABLE IF NOT EXISTS raw_games (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID REFERENCES imports(id) ON DELETE CASCADE,
  provider TEXT,
  source_id TEXT,
  payload JSONB,
  digest TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS raw_games_provider_source_uidx ON raw_games(provider, source_id);
CREATE INDEX IF NOT EXISTS raw_games_import_idx ON raw_games(import_id);

-- Players in a game
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  color TEXT,
  username TEXT,
  rating INT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS players_game_idx ON players(game_id);

-- Moves per game
CREATE TABLE IF NOT EXISTS moves (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  ply INT,
  san TEXT,
  uci TEXT,
  fen_before TEXT,
  fen_after TEXT,
  clock_ms INT,
  eval_cp INT,
  mate_in INT
);
CREATE UNIQUE INDEX IF NOT EXISTS moves_game_ply_uidx ON moves(game_id, ply);

-- Positions aggregate
CREATE TABLE IF NOT EXISTS positions (
  fen TEXT PRIMARY KEY,
  eco TEXT,
  opening_name TEXT,
  agg JSONB,
  last_seen_ts TIMESTAMPTZ
);

-- Mapping of game -> positions
CREATE TABLE IF NOT EXISTS game_positions (
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  ply INT,
  fen TEXT REFERENCES positions(fen) ON DELETE CASCADE,
  PRIMARY KEY(game_id, ply)
);

-- Analyses (engine + LLM)
CREATE TABLE IF NOT EXISTS analyses (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  fen TEXT,
  move_ply INT,
  engine JSONB,
  engine_hash TEXT,
  llm JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analyses_game_idx ON analyses(game_id);
CREATE INDEX IF NOT EXISTS analyses_fen_idx ON analyses(fen);
CREATE UNIQUE INDEX IF NOT EXISTS analyses_unique_engine ON analyses(game_id, move_ply, engine_hash);

-- Activity feed
CREATE TABLE IF NOT EXISTS activities (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  type TEXT NOT NULL,
  subject_id TEXT,
  subject_type TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activities_owner_idx ON activities(COALESCE(user_id::text, session_id::text));

-- Bot games metadata
CREATE TABLE IF NOT EXISTS bot_games (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  difficulty TEXT,
  engine_cfg JSONB,
  game_id BIGINT REFERENCES games(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_games_owner_idx ON bot_games(COALESCE(user_id::text, session_id::text));

-- Simple migrations registry
CREATE TABLE IF NOT EXISTS migrations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Linked accounts for multi-platform tracking
CREATE TABLE IF NOT EXISTS linked_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, username),
  UNIQUE(session_id, platform, username)
);
CREATE INDEX IF NOT EXISTS linked_accounts_owner_idx ON linked_accounts(COALESCE(user_id::text, session_id::text));

-- User preferences/settings
CREATE TABLE IF NOT EXISTS user_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  setting_key TEXT NOT NULL,
  setting_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, setting_key),
  UNIQUE(session_id, setting_key)
);
CREATE INDEX IF NOT EXISTS user_settings_owner_idx ON user_settings(COALESCE(user_id::text, session_id::text));

-- Saved repertoire reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  name TEXT NOT NULL,
  report_data JSONB NOT NULL,
  source_usernames TEXT[],
  is_multi_account BOOLEAN DEFAULT FALSE,
  total_games INTEGER NOT NULL DEFAULT 0,
  overall_winrate FLOAT NOT NULL DEFAULT 0.0,
  preview_openings TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT saved_reports_owner_check CHECK (
    (user_id IS NOT NULL AND session_id IS NULL) OR
    (user_id IS NULL AND session_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS saved_reports_owner_idx ON saved_reports(COALESCE(user_id::text, session_id::text));
CREATE INDEX IF NOT EXISTS saved_reports_created_idx ON saved_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS saved_reports_name_idx ON saved_reports(name);
CREATE INDEX IF NOT EXISTS saved_reports_source_usernames_idx ON saved_reports USING gin(source_usernames);
