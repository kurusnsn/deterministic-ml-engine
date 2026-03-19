-- Add S3 metadata columns for saved reports

ALTER TABLE saved_reports
  ADD COLUMN IF NOT EXISTS report_data_backend TEXT DEFAULT 'db',
  ADD COLUMN IF NOT EXISTS report_data_key TEXT,
  ADD COLUMN IF NOT EXISTS report_data_size_bytes INTEGER;

CREATE INDEX IF NOT EXISTS saved_reports_report_data_key_idx
  ON saved_reports(report_data_key);
