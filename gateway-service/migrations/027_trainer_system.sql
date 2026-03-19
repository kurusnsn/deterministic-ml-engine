-- Personal Trainer System Schema
-- Supports state management, immutable reports, and periodic commentary.

-- 1. Trainer State Machine
CREATE TYPE trainer_status_type AS ENUM (
    'NO_ACCOUNT',
    'BOOTSTRAP_REPORTS_CREATED',
    'ACTIVE_TRAINER',
    'NEEDS_RELINK'
);

CREATE TABLE IF NOT EXISTS trainer_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state trainer_status_type NOT NULL DEFAULT 'NO_ACCOUNT',
    linked_account_id BIGINT REFERENCES linked_accounts(id) ON DELETE SET NULL,
    last_daily_sync_at TIMESTAMPTZ,
    last_deep_update_at TIMESTAMPTZ,
    new_games_since_deep_update INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Immutable Trainer Reports (Baseline & Periodic)
CREATE TABLE IF NOT EXISTS trainer_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    source_account_id BIGINT REFERENCES linked_accounts(id) ON DELETE SET NULL,
    time_control TEXT NOT NULL,
    game_ids BIGINT[] NOT NULL,
    summary_metrics JSONB NOT NULL,
    is_bootstrap BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive
    deactivation_reason TEXT, -- e.g., 'account_removed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_reports_user ON trainer_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_reports_status ON trainer_reports(status);

-- 3. Daily Coaching Commentary
CREATE TABLE IF NOT EXISTS trainer_daily_commentary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    report_date DATE NOT NULL,
    commentary_text TEXT NOT NULL,
    game_ids_analyzed BIGINT[] DEFAULT '{}',
    concepts_detected JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_trainer_daily_commentary_user_date ON trainer_daily_commentary(user_id, report_date);

-- 4. Deep Trainer Snapshots (Weekly/Threshold)
CREATE TABLE IF NOT EXISTS trainer_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    narrative_focus TEXT,
    long_term_patterns JSONB,
    lc0_insights JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_snapshots_user ON trainer_snapshots(user_id);
