CREATE TABLE IF NOT EXISTS user_repertoire_puzzles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repertoire_id UUID NOT NULL REFERENCES user_repertoires(id) ON DELETE CASCADE,
    puzzle_id UUID NOT NULL,
    eco_code TEXT,
    move_number INT,
    mistake_type TEXT,
    source_report_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_repertoire_puzzles_repertoire
    ON user_repertoire_puzzles(repertoire_id);
