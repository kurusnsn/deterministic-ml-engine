-- Add username column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Add display_name for optional customization
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Index for fast username lookups and similarity searches
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users(LOWER(username));

-- Comment: username is unique and case-insensitive for lookups
-- display_name is optional and can contain any characters
