-- Migration: Create report_weak_lines table
-- This table stores line-level weakness analysis for repertoire reports

CREATE TABLE IF NOT EXISTS report_weak_lines (
  id TEXT PRIMARY KEY,
  report_id UUID REFERENCES saved_reports(id) ON DELETE CASCADE,
  eco TEXT,
  line JSONB NOT NULL,
  games_count INT NOT NULL DEFAULT 0,
  winrate FLOAT NOT NULL CHECK (winrate >= 0 AND winrate <= 1),
  avg_eval_swing FLOAT NOT NULL,
  common_mistakes JSONB NOT NULL DEFAULT '[]',
  tactical_issues JSONB NOT NULL DEFAULT '[]',
  puzzle_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS report_weak_lines_report_idx ON report_weak_lines(report_id);
CREATE INDEX IF NOT EXISTS report_weak_lines_eco_idx ON report_weak_lines(eco) WHERE eco IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_weak_lines_line_gin_idx ON report_weak_lines USING GIN(line);
CREATE INDEX IF NOT EXISTS report_weak_lines_winrate_idx ON report_weak_lines(winrate) WHERE winrate < 0.4;

-- Add comments
COMMENT ON TABLE report_weak_lines IS 'Line-level weakness analysis showing problematic opening lines in repertoire reports';
COMMENT ON COLUMN report_weak_lines.id IS 'Unique weak line identifier (format: wl_{report_id}_{line_hash} or UUID)';
COMMENT ON COLUMN report_weak_lines.line IS 'Ordered array of SAN moves representing the opening line (e.g., ["e4", "c5", "Nf3"])';
COMMENT ON COLUMN report_weak_lines.avg_eval_swing IS 'Average evaluation swing (can be negative, indicating position worsening)';
COMMENT ON COLUMN report_weak_lines.common_mistakes IS 'Array of common mistakes made in this line (e.g., ["blunder on move 7"])';
COMMENT ON COLUMN report_weak_lines.tactical_issues IS 'Array of tactical issues frequently occurring in this line (e.g., ["fork", "hanging_piece"])';
COMMENT ON COLUMN report_weak_lines.puzzle_ids IS 'Array of puzzle IDs linked to this weak line';






