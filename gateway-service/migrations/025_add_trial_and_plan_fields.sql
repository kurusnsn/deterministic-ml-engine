-- Migration: Add app-managed trial fields and plan metadata

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT;

-- Defaults for new users (app-managed 7-day trial)
ALTER TABLE users ALTER COLUMN subscription_status SET DEFAULT 'trialing';
ALTER TABLE users ALTER COLUMN trial_started_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN trial_expires_at SET DEFAULT (NOW() + INTERVAL '7 days');

-- Backfill existing users where trial fields are missing
UPDATE users
SET trial_started_at = COALESCE(trial_started_at, created_at, NOW()),
    trial_expires_at = COALESCE(trial_expires_at, COALESCE(created_at, NOW()) + INTERVAL '7 days')
WHERE trial_started_at IS NULL OR trial_expires_at IS NULL;
