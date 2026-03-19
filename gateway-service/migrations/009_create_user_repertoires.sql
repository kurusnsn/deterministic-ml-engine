-- Create tables for user-managed repertoires (core/secondary/experimental)
CREATE TABLE IF NOT EXISTS user_repertoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('core', 'secondary', 'experimental')),
    color TEXT NOT NULL CHECK (color IN ('white', 'black', 'both')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_repertoire_openings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repertoire_id UUID NOT NULL REFERENCES user_repertoires(id) ON DELETE CASCADE,
    eco_code TEXT NOT NULL,
    color TEXT NOT NULL CHECK (color IN ('white', 'black')),
    note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_repertoire_opening
    ON user_repertoire_openings(repertoire_id, eco_code, color);
