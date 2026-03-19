-- Share Clips table for storing shareable game review clips
-- Stores metadata and render configuration for each clip

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS share_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id BIGINT REFERENCES games(id) ON DELETE SET NULL,
    analysis_id TEXT,  -- Reference to saved_reports or game analysis identifier
    primary_move_index INT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    gif_url TEXT,
    thumbnail_url TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    show_threat_arrows BOOLEAN DEFAULT TRUE,
    show_move_classification BOOLEAN DEFAULT TRUE,
    render_payload JSONB,  -- Store frame data for re-rendering
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index on slug for fast public lookups
CREATE UNIQUE INDEX IF NOT EXISTS share_clips_slug_idx ON share_clips(slug);

-- Index for user's clips ordered by creation date
CREATE INDEX IF NOT EXISTS share_clips_user_created_idx ON share_clips(user_id, created_at DESC);

-- Index for game_id lookups
CREATE INDEX IF NOT EXISTS share_clips_game_idx ON share_clips(game_id);
