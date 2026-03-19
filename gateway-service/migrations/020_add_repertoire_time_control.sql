-- Add time_control column to user_repertoires
ALTER TABLE user_repertoires ADD COLUMN IF NOT EXISTS time_control TEXT;

-- Add 'repair' to the type check constraint (if not already present)
-- Drop and recreate the constraint to include repair
ALTER TABLE user_repertoires DROP CONSTRAINT IF EXISTS user_repertoires_type_check;
ALTER TABLE user_repertoires ADD CONSTRAINT user_repertoires_type_check 
    CHECK (type IN ('core', 'secondary', 'experimental', 'repair'));

-- Create an index for time_control queries
CREATE INDEX IF NOT EXISTS idx_user_repertoires_time_control 
    ON user_repertoires(time_control) WHERE time_control IS NOT NULL;
