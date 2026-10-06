-- Add archival support for feature flags to avoid hard-deleting historical config.

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feature_flags_archived
  ON feature_flags (archived_at, created_at DESC);
