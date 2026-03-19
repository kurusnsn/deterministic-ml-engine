-- Add anonymous session support to studies
ALTER TABLE IF EXISTS studies
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- Index for ownership lookups (user or session)
CREATE INDEX IF NOT EXISTS studies_owner_idx
  ON studies(COALESCE(user_id::text, session_id::text));

