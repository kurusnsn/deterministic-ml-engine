-- Migration: Add move analysis fields to moves table
-- This extends the moves table to support engine evaluation, mistake classification, and heuristics

ALTER TABLE moves
  ADD COLUMN IF NOT EXISTS eval_delta INT,
  ADD COLUMN IF NOT EXISTS mistake_type TEXT CHECK (mistake_type IN ('inaccuracy', 'mistake', 'blunder', 'missed_win') OR mistake_type IS NULL),
  ADD COLUMN IF NOT EXISTS heuristics JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS best_move TEXT,
  ADD COLUMN IF NOT EXISTS pv JSONB DEFAULT '[]';

-- Add index on mistake_type for filtering blunders
CREATE INDEX IF NOT EXISTS moves_mistake_type_idx ON moves(mistake_type) WHERE mistake_type IS NOT NULL;

-- Add GIN index on heuristics for efficient JSONB queries
CREATE INDEX IF NOT EXISTS moves_heuristics_gin_idx ON moves USING GIN(heuristics);

-- Add comments explaining the columns
COMMENT ON COLUMN moves.eval_delta IS 'Evaluation delta in centipawns (eval_after - eval_before)';
COMMENT ON COLUMN moves.mistake_type IS 'Classification of move quality: inaccuracy, mistake, blunder, or missed_win';
COMMENT ON COLUMN moves.heuristics IS 'Tactical and positional heuristics detected in the position after this move';
COMMENT ON COLUMN moves.best_move IS 'Best move suggested by engine (SAN notation)';
COMMENT ON COLUMN moves.pv IS 'Principal variation from engine analysis (array of SAN moves)';






