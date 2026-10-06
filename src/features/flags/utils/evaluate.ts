import { computeBucket } from "./bucket";
import { applyRules } from "./rules";
import type { EvaluationResult, FeatureFlag, Rule } from "./types";

/**
 * Evaluate a feature flag for a given fingerprint and context.
 * Pure function — no DB access. Caller is responsible for fetching the flag.
 *
 * Evaluation order:
 *   1. If flag is disabled → false
 *   2. Targeting rules (first match → enabled)
 *   3. Sticky rollout bucket: bucket = fnv1a(name|fingerprint) % 100 < rollout_pct
 */
export function evaluateFlag(
  flag: FeatureFlag,
  fingerprint: string,
  context: Record<string, string> = {},
): EvaluationResult {
  if (!flag.enabled) {
    return { enabled: false, bucket: null, rule_matched: null };
  }

  const rules = (flag.rules ?? []) as Rule[];
  const matchedRule = applyRules(rules, context);
  if (matchedRule !== null) {
    return { enabled: true, bucket: null, rule_matched: matchedRule };
  }

  const bucket = computeBucket(flag.name, fingerprint);
  const enabled = bucket < flag.rollout_pct;
  return { enabled, bucket, rule_matched: null };
}
