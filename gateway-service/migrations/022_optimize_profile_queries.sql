-- Migration: Optimize profile queries and trainer selection

CREATE INDEX IF NOT EXISTS studies_user_updated_idx
    ON studies(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studies_session_updated_idx
    ON studies(session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS saved_puzzles_user_created_idx
    ON saved_puzzles(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_puzzles_session_created_idx
    ON saved_puzzles(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS key_positions_training_idx
    ON key_positions(user_id, time_control_bucket, side, eval_loss_cp);
