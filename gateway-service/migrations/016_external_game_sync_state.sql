-- Migration: External Game Sync State
-- Tracks sync progress for each user's linked external accounts (Lichess, Chess.com)

CREATE TABLE IF NOT EXISTS external_game_sync_state (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    provider VARCHAR(32) NOT NULL,              -- 'lichess' | 'chesscom'
    last_synced_at TIMESTAMPTZ,                 -- When last sync completed
    last_synced_timestamp BIGINT,               -- Lichess "since" param (epoch ms)
    last_synced_month VARCHAR(7),               -- Chess.com 'YYYY-MM' format
    sync_status VARCHAR(32) DEFAULT 'idle',     -- 'idle' | 'syncing' | 'failed'
    error_message TEXT,
    games_synced INTEGER DEFAULT 0,             -- Total games synced for this provider
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Each provider can only have one sync state per user/session
    CONSTRAINT external_game_sync_state_user_provider_unique UNIQUE (user_id, provider),
    CONSTRAINT external_game_sync_state_session_provider_unique UNIQUE (session_id, provider),
    -- Must have either user_id or session_id
    CONSTRAINT external_game_sync_state_owner_check CHECK (
        (user_id IS NOT NULL AND session_id IS NULL) OR
        (user_id IS NULL AND session_id IS NOT NULL)
    )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS external_game_sync_state_user_idx 
    ON external_game_sync_state(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_game_sync_state_session_idx 
    ON external_game_sync_state(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_game_sync_state_status_idx 
    ON external_game_sync_state(sync_status);
