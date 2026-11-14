import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "./rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("blocks requests after the max within a window", () => {
    const key = "ip:create:127.0.0.1";
    const first = consumeRateLimit(key, 2, 10_000);
    const second = consumeRateLimit(key, 2, 10_000);
    const third = consumeRateLimit(key, 2, 10_000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets limits after the window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = "ip:evaluate:127.0.0.1";
    expect(consumeRateLimit(key, 1, 5_000).allowed).toBe(true);
    expect(consumeRateLimit(key, 1, 5_000).allowed).toBe(false);

    vi.advanceTimersByTime(5_001);
    expect(consumeRateLimit(key, 1, 5_000).allowed).toBe(true);
  });
});
