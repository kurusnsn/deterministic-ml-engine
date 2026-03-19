-- Table to track mastered opening lines
CREATE TABLE IF NOT EXISTS mastered_opening_lines (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    opening_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    mastered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mastered_opening_lines_user_unique 
    ON mastered_opening_lines (user_id, opening_id, line_id) 
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_mastered_opening_lines_session_unique 
    ON mastered_opening_lines (session_id, opening_id, line_id) 
    WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX idx_mastered_openings_user ON mastered_opening_lines(user_id);
CREATE INDEX idx_mastered_openings_session ON mastered_opening_lines(session_id);
CREATE INDEX idx_mastered_openings_opening ON mastered_opening_lines(opening_id);
