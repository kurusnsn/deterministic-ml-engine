-- User games ownership join table (supports multi-owner access)
CREATE TABLE IF NOT EXISTS user_games (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_games_owner_check CHECK (
    (user_id IS NOT NULL AND session_id IS NULL) OR
    (user_id IS NULL AND session_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_games_user_game_uidx
  ON user_games(user_id, game_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_games_session_game_uidx
  ON user_games(session_id, game_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_games_owner_idx
  ON user_games(COALESCE(user_id::text, session_id::text));

CREATE INDEX IF NOT EXISTS user_games_game_idx
  ON user_games(game_id);
