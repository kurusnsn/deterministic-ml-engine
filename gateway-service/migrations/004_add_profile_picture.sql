-- Add profile_picture column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS users_profile_picture_idx ON users(id) WHERE profile_picture IS NOT NULL;
