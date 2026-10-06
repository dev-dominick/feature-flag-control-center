/**
 * FNV-1a 32-bit hash — pure TypeScript, zero dependencies.
 * https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 *
 * Produces a deterministic uint32 from any string.
 * Used for sticky user bucketing in feature flag rollouts.
 */
export function fnv1a(input: string): number {
  let hash = 2166136261; // FNV-32 offset basis (0x811c9dc5)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime, keep as uint32
  }
  return hash;
}

/**
 * Compute a sticky bucket [0, 99] for a (flagName, fingerprint) pair.
 * The same pair always returns the same bucket — no randomness after assignment.
 */
export function computeBucket(flagName: string, fingerprint: string): number {
  return fnv1a(`${flagName}|${fingerprint}`) % 100;
}
