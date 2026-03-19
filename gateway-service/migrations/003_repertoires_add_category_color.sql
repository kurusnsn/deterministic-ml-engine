-- Add category and color fields to repertoires table
ALTER TABLE repertoires
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT;

-- Add check constraints for valid enum values (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'repertoires_category_check'
    ) THEN
        ALTER TABLE repertoires
            ADD CONSTRAINT repertoires_category_check
            CHECK (category IN ('core', 'repair', 'expansion', 'experimental', 'developing'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'repertoires_color_check'
    ) THEN
        ALTER TABLE repertoires
            ADD CONSTRAINT repertoires_color_check
            CHECK (color IN ('white', 'black', 'both'));
    END IF;
END $$;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS repertoires_category_idx ON repertoires(category);
CREATE INDEX IF NOT EXISTS repertoires_color_idx ON repertoires(color);
