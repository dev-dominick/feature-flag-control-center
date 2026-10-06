/**
 * Flags feature public API
 *
 * Export types and utilities usable from both client and server.
 */

export { computeBucket, evaluateFlag, applyRules } from "./utils";
export type { EvaluationResult, FeatureFlag, Rule } from "./utils";
