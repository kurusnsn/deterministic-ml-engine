-- Migration: INFRA-5 Stripe Webhook Idempotency
-- Prevents duplicate processing of Stripe webhook events

CREATE TABLE IF NOT EXISTS stripe_events_processed (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup of old events (optional scheduled job)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON stripe_events_processed(processed_at);

COMMENT ON TABLE stripe_events_processed IS 'SECURITY: Stores processed Stripe event IDs to prevent duplicate webhook handling';
