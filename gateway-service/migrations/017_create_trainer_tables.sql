-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Table: user_game_memory_state
-- Tracks overall memory processing state per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_game_memory_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_processed_game_at TIMESTAMPTZ,
    last_memory_rebuild_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Table: user_memory_snapshot
-- Per user/time-control/side snapshot of training memory
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_memory_snapshot (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    time_control TEXT NOT NULL CHECK (time_control IN ('bullet', 'blitz', 'rapid', 'classical', 'all')),
    side TEXT NOT NULL CHECK (side IN ('white', 'black', 'both')),
    sample_size INT NOT NULL DEFAULT 0,
    raw_stats JSONB NOT NULL DEFAULT '{}',
    recommendations JSONB NOT NULL DEFAULT '{}',
    coach_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, time_control, side)
);

CREATE INDEX IF NOT EXISTS user_memory_snapshot_user_idx ON user_memory_snapshot(user_id);
CREATE INDEX IF NOT EXISTS user_memory_snapshot_time_control_idx ON user_memory_snapshot(time_control);

-- ============================================================================
-- Table: key_positions
-- Key moments from games for puzzle/PV line training
-- ============================================================================
CREATE TABLE IF NOT EXISTS key_positions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    move_number INT NOT NULL,
    fen_before TEXT NOT NULL,
    side_to_move TEXT NOT NULL CHECK (side_to_move IN ('white', 'black')),
    played_move_san TEXT,
    best_move_san TEXT,
    pv_san JSONB DEFAULT '[]',
    eval_loss_cp INT,
    phase TEXT CHECK (phase IN ('opening', 'middlegame', 'endgame')),
    time_control_bucket TEXT CHECK (time_control_bucket IN ('bullet', 'blitz', 'rapid', 'classical')),
    side TEXT CHECK (side IN ('white', 'black')),
    tags JSONB DEFAULT '[]',
    outcome_impact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS key_positions_user_idx ON key_positions(user_id);
CREATE INDEX IF NOT EXISTS key_positions_game_idx ON key_positions(game_id);
CREATE INDEX IF NOT EXISTS key_positions_time_control_idx ON key_positions(time_control_bucket);
CREATE INDEX IF NOT EXISTS key_positions_tags_gin ON key_positions USING GIN (tags);

-- ============================================================================
-- Table: game_embeddings
-- Vector embeddings for semantic search over game summaries
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_embeddings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    summary_text TEXT NOT NULL,
    embedding vector(1536),  -- OpenAI ada-002 embedding dimension
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id)
);

CREATE INDEX IF NOT EXISTS game_embeddings_user_idx ON game_embeddings(user_id);
CREATE INDEX IF NOT EXISTS game_embeddings_vector_idx ON game_embeddings 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- Add memory_indexed_at column to games table
-- Tracks when a game was indexed for memory/vector search
-- ============================================================================
ALTER TABLE IF EXISTS games
    ADD COLUMN IF NOT EXISTS memory_indexed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS games_memory_indexed_idx ON games(memory_indexed_at);
