-- Migration: Create report_puzzles table
-- This table stores puzzles generated from blunders in repertoire reports

CREATE TABLE IF NOT EXISTS report_puzzles (
  id TEXT PRIMARY KEY,
  report_id UUID REFERENCES saved_reports(id) ON DELETE CASCADE,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  move_ply INT NOT NULL,
  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('white', 'black')),
  best_move TEXT NOT NULL,
  theme JSONB NOT NULL DEFAULT '[]',
  mistake_move TEXT NOT NULL,
  weak_line_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS report_puzzles_report_idx ON report_puzzles(report_id);
CREATE INDEX IF NOT EXISTS report_puzzles_game_idx ON report_puzzles(game_id);
CREATE INDEX IF NOT EXISTS report_puzzles_weak_line_idx ON report_puzzles(weak_line_id) WHERE weak_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_puzzles_theme_gin_idx ON report_puzzles USING GIN(theme);

-- Add comments
COMMENT ON TABLE report_puzzles IS 'Puzzles generated from blunders detected in repertoire analysis reports';
COMMENT ON COLUMN report_puzzles.id IS 'Unique puzzle identifier (format: pz_{game_id}_{move_ply} or UUID)';
COMMENT ON COLUMN report_puzzles.theme IS 'Array of tactical themes (e.g., ["fork", "hanging_piece"])';
COMMENT ON COLUMN report_puzzles.weak_line_id IS 'Reference to report_weak_lines.id if this puzzle is linked to a weak line';






