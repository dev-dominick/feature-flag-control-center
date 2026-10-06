"use client";

/**
 * Flags feature client-only exports
 *
 * This file is marked "use client" and exports only client-safe utilities.
 */

export { FlagsControlCenter } from "./components/FlagsControlCenter";

export {
  evaluateClientFlag,
  readClientFlagStates,
  writeClientFlagState,
  CLIENT_FLAGS_STORAGE_KEY,
  CLIENT_FLAGS_UPDATED_EVENT,
  CLIENT_FINGERPRINT_STORAGE_KEY,
} from "./utils/client-state";
