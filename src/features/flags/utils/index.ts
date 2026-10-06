/**
 * Flags utilities - shared across all feature modules
 */

export { computeBucket } from "./bucket";
export {
  evaluateClientFlag,
  readClientFlagStates,
  writeClientFlagState,
  CLIENT_FLAGS_STORAGE_KEY,
  CLIENT_FLAGS_UPDATED_EVENT,
  CLIENT_FINGERPRINT_STORAGE_KEY,
} from "./client-state";
export type { ClientFlagState } from "./client-state";
export { evaluateFlag } from "./evaluate";
export { applyRules } from "./rules";
export type { EvaluationResult, FeatureFlag, Rule } from "./types";
