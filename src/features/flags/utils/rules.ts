import type { Rule } from "./types";

/**
 * Apply targeting rules against a string context object.
 * Returns the matched rule's attribute name, or null if no rule matches.
 * First-match wins.
 */
export function applyRules(rules: Rule[], context: Record<string, string>): string | null {
  for (const rule of rules) {
    const val = context[rule.attribute];
    if (val === undefined) continue;

    switch (rule.operator) {
      case "eq":
        if (val === rule.value) return rule.attribute;
        break;
      case "contains":
        if (typeof rule.value === "string" && val.includes(rule.value)) return rule.attribute;
        break;
      case "startsWith":
        if (typeof rule.value === "string" && val.startsWith(rule.value)) return rule.attribute;
        break;
      case "in":
        if (Array.isArray(rule.value) && rule.value.includes(val)) return rule.attribute;
        break;
    }
  }
  return null;
}
