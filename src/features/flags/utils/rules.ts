import type { Rule } from "./types";

function normalizeContextValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(",");
  }

  return undefined;
}

/**
 * Apply targeting rules against a context object whose values may be strings, numbers, or booleans.
 * Returns the matched rule's attribute name, or null if no rule matches.
 * First-match wins.
 */
export function applyRules(rules: Rule[], context: Record<string, unknown>): string | null {
  for (const rule of rules) {
    const val = normalizeContextValue(context[rule.attribute]);
    if (val === undefined) continue;

    switch (rule.operator) {
      case "eq":
        if (val === String(rule.value)) return rule.attribute;
        break;
      case "contains":
        if (typeof rule.value === "string" && val.includes(rule.value)) return rule.attribute;
        break;
      case "startsWith":
        if (typeof rule.value === "string" && val.startsWith(rule.value)) return rule.attribute;
        break;
      case "in":
        if (Array.isArray(rule.value) && rule.value.some((entry) => String(entry) === val)) {
          return rule.attribute;
        }
        break;
    }
  }
  return null;
}
