-- 026_add_era_to_population_style_stats.sql
--
-- Adds era column to population_style_stats for meta/era bucketing.
-- Era buckets: '2014-2016', '2017-2019', '2020-2022', '2023+'
--
-- This enables tracking how playing styles evolve over time at the population level.

-- Add era column (nullable initially for backward compatibility)
ALTER TABLE population_style_stats ADD COLUMN IF NOT EXISTS era TEXT;

-- Drop existing primary key and recreate with era
-- Note: This will fail if there's duplicate data after adding era - run baseline job to repopulate
ALTER TABLE population_style_stats DROP CONSTRAINT IF EXISTS population_style_stats_pkey;

-- Create new composite primary key including era
ALTER TABLE population_style_stats 
  ADD PRIMARY KEY (rating_bucket, speed, era, color, metric);

-- Update index for efficient lookups with era
DROP INDEX IF EXISTS idx_population_style_stats_metric;
CREATE INDEX IF NOT EXISTS idx_population_style_stats_metric_era
  ON population_style_stats (metric, rating_bucket, speed, era);

-- Add comment for documentation
COMMENT ON COLUMN population_style_stats.era IS 'Era bucket: 2014-2016, 2017-2019, 2020-2022, 2023+';
