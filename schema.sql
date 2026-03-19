-- Table for user profiles
CREATE TABLE users (
    id UUID PRIMARY KEY, -- This will store the user ID from Supabase Auth
    email TEXT UNIQUE,
    username TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    trial_started_at TIMESTAMPTZ DEFAULT NOW(),
    trial_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    subscription_plan TEXT,
    subscription_billing_cycle TEXT,
    puzzle_rating INT DEFAULT 1500,
    puzzles_done INT DEFAULT 0,
    streak INT DEFAULT 0,
    last_active TIMESTAMPTZ DEFAULT NOW()
);

-- Table for games
CREATE TABLE games (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pgn TEXT NOT NULL,
    source TEXT,
    time_control TEXT,
    result TEXT,
    opponent_username TEXT,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for user subscriptions (managed by Stripe webhooks)
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY, -- Stripe Subscription ID
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT,
    plan_id TEXT,
    current_period_end TIMESTAMPTZ
);

-- Table for custom user repertoires
CREATE TABLE repertoires (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pgn TEXT NOT NULL
);

-- Table for tactical puzzles
CREATE TABLE puzzles (
    id TEXT PRIMARY KEY,
    fen TEXT NOT NULL,
    moves TEXT[] NOT NULL,
    rating INT,
    rating_deviation INT,
    popularity INT,
    nb_plays INT,
    themes TEXT[],
    game_url TEXT,
    opening_tags TEXT[],
    eco TEXT,
    opening TEXT,
    variation TEXT
);

CREATE INDEX idx_puzzles_rating ON puzzles (rating);
CREATE INDEX idx_puzzles_eco ON puzzles (eco);
CREATE INDEX idx_puzzles_themes_gin ON puzzles USING GIN (themes);

-- Table for puzzle attempts
CREATE TABLE user_puzzles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id TEXT REFERENCES puzzles(id) ON DELETE CASCADE,
    correct BOOLEAN,
    time_spent REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
