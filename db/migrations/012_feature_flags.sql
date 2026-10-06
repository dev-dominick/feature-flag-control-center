-- Feature Flag Engine: rollout-percentage bucketing + attribute targeting rules

CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  rollout_pct SMALLINT    NOT NULL DEFAULT 0
              CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
  rules       JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags (name);

CREATE TABLE IF NOT EXISTS flag_evaluations (
  id           BIGSERIAL   PRIMARY KEY,
  flag_id      UUID        NOT NULL REFERENCES feature_flags (id) ON DELETE CASCADE,
  fingerprint  TEXT        NOT NULL,
  bucket       SMALLINT    NOT NULL,
  result       BOOLEAN     NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_evals_flag_id ON flag_evaluations (flag_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_flag_evals_fingerprint ON flag_evaluations (fingerprint);

-- Seed 4 demo flags so the page is interactive immediately
INSERT INTO feature_flags (name, description, enabled, rollout_pct, rules) VALUES
  ('dark_mode',       'New dark mode theme rollout',       TRUE,  0,   '[]'),
  ('beta_dashboard',  'Beta dashboard for early adopters', TRUE,  25,  '[]'),
  ('new_checkout',    'Redesigned checkout flow',          TRUE,  50,  '[]'),
  ('premium_content', 'Premium content access',            TRUE,  100, '[]')
ON CONFLICT (name) DO NOTHING;
