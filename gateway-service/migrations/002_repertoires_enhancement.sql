-- Enhanced repertoires table for saving and managing user repertoires
-- This migration extends the existing basic repertoires table to support the full repertoire management system

-- Drop existing repertoires table if it exists (it's basic and doesn't match our needs)
DROP TABLE IF EXISTS repertoire_lines CASCADE;
DROP TABLE IF EXISTS repertoires CASCADE;

-- Create the new enhanced repertoires table
CREATE TABLE repertoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    name TEXT NOT NULL,
    eco_codes JSONB NOT NULL DEFAULT '[]',  -- Array of ECO codes like ["B20", "B21"]
    openings JSONB NOT NULL DEFAULT '[]',   -- Array of opening objects {eco, name, color, games_count, winrate, frequency}
    source_report_id UUID,  -- Optional link back to the report that generated this repertoire
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure either user_id or session_id is set, but not both
    CONSTRAINT repertoires_owner_check CHECK (
        (user_id IS NOT NULL AND session_id IS NULL) OR
        (user_id IS NULL AND session_id IS NOT NULL)
    ),
    
    -- Name should not be empty
    CONSTRAINT repertoires_name_check CHECK (char_length(trim(name)) > 0)
);

-- Create indexes for performance
CREATE INDEX repertoires_owner_idx ON repertoires(COALESCE(user_id::text, session_id::text));
CREATE INDEX repertoires_user_id_idx ON repertoires(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX repertoires_session_id_idx ON repertoires(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX repertoires_created_at_idx ON repertoires(created_at DESC);
CREATE INDEX repertoires_updated_at_idx ON repertoires(updated_at DESC);
CREATE INDEX repertoires_favorite_idx ON repertoires(favorite) WHERE favorite = TRUE;
CREATE INDEX repertoires_source_report_idx ON repertoires(source_report_id) WHERE source_report_id IS NOT NULL;

-- GIN index for ECO codes array searches
CREATE INDEX repertoires_eco_codes_gin_idx ON repertoires USING gin(eco_codes);

-- Add a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_repertoires_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_repertoires_updated_at_trigger
    BEFORE UPDATE ON repertoires
    FOR EACH ROW
    EXECUTE FUNCTION update_repertoires_updated_at();

-- Optional: Add a reference from saved_reports to repertoires for bidirectional linking
-- This allows us to track which repertoires were created from a specific report
ALTER TABLE saved_reports 
    ADD COLUMN IF NOT EXISTS repertoires_created INTEGER DEFAULT 0;

-- Create a function to update repertoires count when a repertoire is created from a report
CREATE OR REPLACE FUNCTION update_report_repertoires_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment count on INSERT
    IF TG_OP = 'INSERT' AND NEW.source_report_id IS NOT NULL THEN
        UPDATE saved_reports 
        SET repertoires_created = COALESCE(repertoires_created, 0) + 1 
        WHERE id = NEW.source_report_id;
    END IF;
    
    -- Decrement count on DELETE
    IF TG_OP = 'DELETE' AND OLD.source_report_id IS NOT NULL THEN
        UPDATE saved_reports 
        SET repertoires_created = GREATEST(COALESCE(repertoires_created, 0) - 1, 0)
        WHERE id = OLD.source_report_id;
    END IF;
    
    -- Handle UPDATE (if source_report_id changes)
    IF TG_OP = 'UPDATE' THEN
        -- Decrement old report count
        IF OLD.source_report_id IS NOT NULL AND (NEW.source_report_id IS NULL OR NEW.source_report_id != OLD.source_report_id) THEN
            UPDATE saved_reports 
            SET repertoires_created = GREATEST(COALESCE(repertoires_created, 0) - 1, 0)
            WHERE id = OLD.source_report_id;
        END IF;
        
        -- Increment new report count
        IF NEW.source_report_id IS NOT NULL AND (OLD.source_report_id IS NULL OR NEW.source_report_id != OLD.source_report_id) THEN
            UPDATE saved_reports 
            SET repertoires_created = COALESCE(repertoires_created, 0) + 1
            WHERE id = NEW.source_report_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Create trigger to maintain repertoires count
CREATE TRIGGER update_report_repertoires_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON repertoires
    FOR EACH ROW
    EXECUTE FUNCTION update_report_repertoires_count();