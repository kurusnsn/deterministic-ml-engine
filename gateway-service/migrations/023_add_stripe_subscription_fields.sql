-- Migration: Add Stripe subscription fields to users table
-- This adds the fields needed for Stripe subscription management

-- Add stripe_customer_id to link users to Stripe customers
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add subscription tracking fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_trial_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

-- Create index for faster Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

-- Update the existing subscriptions table to be more useful
-- (keeping it for historical records and detailed subscription data)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
