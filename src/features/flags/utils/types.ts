export type RuleOperator = "eq" | "contains" | "startsWith" | "in";

export type Rule = {
  attribute: string;
  operator: RuleOperator;
  value: string | string[];
};

export type FeatureFlag = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_pct: number;
  rules: Rule[];
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  source: string | null;
};

export type EvaluationResult = {
  enabled: boolean;
  bucket: number | null;
  rule_matched: string | null;
};
