ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS source VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_feature_flags_source
  ON feature_flags (source)
  WHERE source IS NOT NULL;
