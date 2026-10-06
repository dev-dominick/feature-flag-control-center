import { describe, expect, it } from "vitest";
import { evaluateFlag } from "./evaluate";
import type { FeatureFlag } from "./types";

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "checkout_beta",
    description: null,
    enabled: true,
    rollout_pct: 50,
    rules: [],
    created_at: new Date(),
    updated_at: new Date(),
    archived_at: null,
    source: null,
    ...overrides,
  };
}

describe("evaluateFlag", () => {
  it("returns disabled when flag is disabled", () => {
    const result = evaluateFlag(makeFlag({ enabled: false }), "user-1", { tier: "pro" });
    expect(result.enabled).toBe(false);
    expect(result.bucket).toBeNull();
    expect(result.rule_matched).toBeNull();
  });

  it("prioritizes matching targeting rule over rollout bucket", () => {
    const result = evaluateFlag(
      makeFlag({
        rollout_pct: 0,
        rules: [{ attribute: "tier", operator: "eq", value: "pro" }],
      }),
      "user-2",
      { tier: "pro" },
    );

    expect(result.enabled).toBe(true);
    expect(result.rule_matched).toBe("tier");
    expect(result.bucket).toBeNull();
  });

  it("uses deterministic rollout bucket when no rules match", () => {
    const first = evaluateFlag(makeFlag({ rules: [] }), "user-42", {});
    const second = evaluateFlag(makeFlag({ rules: [] }), "user-42", {});

    expect(first.bucket).not.toBeNull();
    expect(first.bucket).toBe(second.bucket);
    expect(first.enabled).toBe(second.enabled);
  });
});
