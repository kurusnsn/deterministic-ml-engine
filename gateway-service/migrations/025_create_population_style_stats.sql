-- 025_create_population_style_stats.sql
-- 
-- Creates table to store population baseline statistics for playing style metrics.
-- Used for normalizing user style scores against the population.

CREATE TABLE IF NOT EXISTS population_style_stats (
  rating_bucket INT NOT NULL,           -- 1000, 1200, 1400, 1600, 1800, 2000, 2200
  speed TEXT NOT NULL,                  -- 'bullet' | 'blitz' | 'rapid' | 'classical'
  color TEXT NOT NULL,                  -- 'white' | 'black'
  metric TEXT NOT NULL,                 -- e.g. 'aggression'
  mean FLOAT,
  std FLOAT,
  p25 FLOAT,
  p50 FLOAT,
  p75 FLOAT,
  p90 FLOAT,
  sample_size INT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (rating_bucket, speed, color, metric)
);

-- Index for efficient lookups by metric type
CREATE INDEX IF NOT EXISTS idx_population_style_stats_metric
  ON population_style_stats (metric, rating_bucket, speed);
