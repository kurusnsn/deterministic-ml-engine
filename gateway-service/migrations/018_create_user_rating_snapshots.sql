-- Migration: Create user_rating_snapshots table for rating progress graphs
-- This table stores historical rating snapshots from game syncs and puzzle attempts

CREATE TABLE IF NOT EXISTS user_rating_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    
    -- "lichess", "chesscom", "internal"
    provider TEXT NOT NULL,
    
    -- "bullet", "blitz", "rapid", "classical", "correspondence", "puzzle"
    time_control TEXT NOT NULL,
    
    -- "game" or "puzzle"
    rating_type TEXT NOT NULL,
    
    rating INTEGER NOT NULL,
    
    -- The moment this rating snapshot is valid (game end time or puzzle completion)
    recorded_at TIMESTAMPTZ NOT NULL,
    
    -- For traceability (e.g., game source_id, puzzle_attempt_id)
    source_id TEXT NULL,
    source_type TEXT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT user_rating_snapshots_owner_check CHECK (
        (user_id IS NOT NULL) OR (session_id IS NOT NULL)
    )
);

-- Index for efficient querying by user + filters
CREATE INDEX IF NOT EXISTS idx_urs_user_provider_tc_type
    ON user_rating_snapshots (user_id, provider, time_control, rating_type, recorded_at)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_urs_session_provider_tc_type
    ON user_rating_snapshots (session_id, provider, time_control, rating_type, recorded_at)
    WHERE session_id IS NOT NULL;

-- Unique constraint to prevent duplicate snapshots for the same game/puzzle
CREATE UNIQUE INDEX IF NOT EXISTS idx_urs_unique_source
    ON user_rating_snapshots (COALESCE(user_id::text, session_id::text), provider, source_id, rating_type)
    WHERE source_id IS NOT NULL;
