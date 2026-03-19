-- Migration: Create saved_puzzles table for user profile puzzles
-- Allows saving puzzles directly to profile without requiring a repertoire

CREATE TABLE IF NOT EXISTS saved_puzzles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    session_id TEXT,
    
    -- Puzzle data (denormalized for fast fetching)
    puzzle_id TEXT NOT NULL,
    fen TEXT NOT NULL,
    best_move TEXT,
    mistake_move TEXT,
    themes TEXT[] DEFAULT '{}',
    eco_code TEXT,
    move_number INT,
    mistake_type TEXT,
    side_to_move TEXT,
    
    -- Source metadata for display
    source_report_id UUID,
    source_report_name TEXT,
    time_control TEXT,
    repertoire_type TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate puzzle saves
    UNIQUE (user_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_puzzles_user
    ON saved_puzzles(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_puzzles_session
    ON saved_puzzles(session_id);

COMMENT ON TABLE saved_puzzles IS 'User-saved puzzles from repertoire reports for practice on profile page';
