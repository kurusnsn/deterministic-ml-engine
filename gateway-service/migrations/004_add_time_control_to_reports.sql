-- Migration: Add time_control column to saved_reports
-- This allows filtering reports by time control (bullet, blitz, rapid, classical)

ALTER TABLE saved_reports
  ADD COLUMN IF NOT EXISTS time_control TEXT;

-- Add index for efficient filtering by time control
CREATE INDEX IF NOT EXISTS saved_reports_time_control_idx 
  ON saved_reports(time_control);

-- Add comment explaining the column
COMMENT ON COLUMN saved_reports.time_control IS 'Time control filter used when generating this report (e.g., bullet, blitz, rapid, classical). NULL for reports generated before this feature or without time control filter.';
