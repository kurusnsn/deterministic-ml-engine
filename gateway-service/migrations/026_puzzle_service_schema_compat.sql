-- Ensure puzzle-service schema exists in shared gateway DB.
-- This keeps puzzle endpoints from failing when only gateway migrations are applied.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS puzzle_rating INT DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS puzzles_done INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();

-- puzzle-service can upsert users by id only; provide a safe default email
-- so NOT NULL + UNIQUE constraints remain valid.
ALTER TABLE IF EXISTS users
  ALTER COLUMN email SET DEFAULT (gen_random_uuid()::text || '@dev.local');

CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  fen TEXT NOT NULL,
  moves TEXT[] NOT NULL,
  rating INT,
  rating_deviation INT,
  popularity INT,
  nb_plays INT,
  themes TEXT[],
  game_url TEXT,
  opening_tags TEXT[],
  eco TEXT,
  opening TEXT,
  variation TEXT
);

CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles (rating);
CREATE INDEX IF NOT EXISTS idx_puzzles_eco ON puzzles (eco);
CREATE INDEX IF NOT EXISTS idx_puzzles_themes_gin ON puzzles USING GIN (themes);

CREATE TABLE IF NOT EXISTS user_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id TEXT REFERENCES puzzles(id) ON DELETE CASCADE,
  correct BOOLEAN,
  time_spent REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_puzzles_user_created_at
  ON user_puzzles (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_puzzles_puzzle_id
  ON user_puzzles (puzzle_id);
