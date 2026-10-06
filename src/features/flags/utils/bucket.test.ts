import { describe, expect, it } from "vitest";
import { fnv1a, computeBucket } from "./bucket";

describe("fnv1a", () => {
  it("returns a non-negative 32-bit integer for any string", () => {
    const result = fnv1a("hello");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  it("is deterministic", () => {
    expect(fnv1a("test")).toBe(fnv1a("test"));
  });

  it("produces different values for different inputs", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("def"));
  });

  it("matches known FNV-1a 32-bit value for empty string", () => {
    // FNV-1a 32-bit: empty string returns the offset basis
    expect(fnv1a("")).toBe(2166136261);
  });

  it("matches known FNV-1a 32-bit value for 'a'", () => {
    // Expected: 0xe40c292c = 3826002220
    expect(fnv1a("a")).toBe(3826002220);
  });
});

describe("computeBucket", () => {
  it("returns a value in [0, 99]", () => {
    for (let i = 0; i < 100; i++) {
      const fp = `user-${i}`;
      const b = computeBucket("my_flag", fp);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
    }
  });

  it("is deterministic — same inputs always yield same bucket", () => {
    const b1 = computeBucket("dark_mode", "user-42");
    const b2 = computeBucket("dark_mode", "user-42");
    expect(b1).toBe(b2);
  });

  it("is flag-name-scoped — same fingerprint in different flags gets different buckets", () => {
    const buckets = new Set<number>();
    for (const flagName of ["flag_a", "flag_b", "flag_c", "flag_d"]) {
      buckets.add(computeBucket(flagName, "user-abc"));
    }
    // At least 2 distinct buckets across 4 flags with the same fingerprint
    expect(buckets.size).toBeGreaterThan(1);
  });

  it("distributes uniformly enough across 1000 fingerprints", () => {
    const counts = new Array<number>(100).fill(0);
    for (let i = 0; i < 1000; i++) {
      const b = computeBucket("rollout_test", `user-${i}`);
      counts[b]!++;
    }
    // With 1000 samples across 100 buckets, each should average ~10
    // A very wide tolerance to avoid flakiness
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    expect(max).toBeLessThan(40);
    expect(min).toBeGreaterThanOrEqual(0);
  });
});
