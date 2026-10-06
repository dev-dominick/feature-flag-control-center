import { computeBucket } from "./bucket";

export type ClientFlagState = {
  enabled: boolean;
  rollout_pct: number;
};

export const CLIENT_FLAGS_STORAGE_KEY = "portfolio.feature_flags.mock.v1";
export const CLIENT_FINGERPRINT_STORAGE_KEY = "portfolio.feature_flags.fingerprint.v1";
export const CLIENT_FLAGS_UPDATED_EVENT = "feature-flags-updated";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function sanitizeFlagState(input: unknown): ClientFlagState | null {
  if (!isRecord(input)) return null;

  const enabled = input.enabled;
  const rolloutPct = input.rollout_pct;
  if (typeof enabled !== "boolean" || typeof rolloutPct !== "number") {
    return null;
  }

  if (!Number.isFinite(rolloutPct)) {
    return null;
  }

  return {
    enabled,
    rollout_pct: Math.max(0, Math.min(100, Math.round(rolloutPct))),
  };
}

export function readClientFlagStates(): Record<string, ClientFlagState> {
  if (typeof window === "undefined") return {};

  const raw = localStorage.getItem(CLIENT_FLAGS_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};

    const next: Record<string, ClientFlagState> = {};
    for (const [name, value] of Object.entries(parsed)) {
      const state = sanitizeFlagState(value);
      if (state) next[name] = state;
    }

    return next;
  } catch {
    return {};
  }
}

function writeClientFlagStates(states: Record<string, ClientFlagState>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLIENT_FLAGS_STORAGE_KEY, JSON.stringify(states));
  window.dispatchEvent(new CustomEvent(CLIENT_FLAGS_UPDATED_EVENT));
}

export function getClientFlagState(name: string): ClientFlagState | null {
  const states = readClientFlagStates();
  return states[name] ?? null;
}

export function writeClientFlagState(name: string, state: ClientFlagState) {
  if (typeof window === "undefined") return;
  const states = readClientFlagStates();
  states[name] = {
    enabled: state.enabled,
    rollout_pct: Math.max(0, Math.min(100, Math.round(state.rollout_pct))),
  };
  writeClientFlagStates(states);
}

export function getOrCreateClientFlagFingerprint(): string {
  if (typeof window === "undefined") return "server";

  const existing = localStorage.getItem(CLIENT_FINGERPRINT_STORAGE_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  localStorage.setItem(CLIENT_FINGERPRINT_STORAGE_KEY, generated);
  return generated;
}

export function evaluateClientFlag(name: string): boolean | null {
  const state = getClientFlagState(name);
  if (!state) return null;
  if (!state.enabled) return false;

  const fingerprint = getOrCreateClientFlagFingerprint();
  const bucket = computeBucket(name, fingerprint);
  return bucket < state.rollout_pct;
}
