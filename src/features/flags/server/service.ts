import { z } from "zod";
import { getDb } from "@/lib/db";
import { evaluateFlag, computeBucket } from "@/features/flags";
import type { EvaluationResult, FeatureFlag, Rule } from "@/features/flags";

const ruleSchema: z.ZodType<Rule> = z.object({
  attribute: z.string().trim().min(1).max(100),
  operator: z.enum(["eq", "contains", "startsWith", "in"]),
  value: z.union([z.string().trim().min(1).max(300), z.array(z.string().trim().min(1).max(300))]),
});

export const createFlagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Name must be lowercase alphanumeric with underscores"),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional().default(false),
  rollout_pct: z.number().int().min(0).max(100).optional().default(0),
  rules: z.array(ruleSchema).optional().default([]),
});

export const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  rollout_pct: z.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  rules: z.array(ruleSchema).optional(),
});

export const evaluateFlagSchema = z.object({
  subjectKey: z.string().trim().min(1).max(300),
  context: z.record(z.string(), z.string()).optional().default({}),
});

export async function listFlags(): Promise<FeatureFlag[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM feature_flags
    WHERE archived_at IS NULL
      AND (source IS NULL OR source != 'e2e')
    ORDER BY created_at ASC, id ASC
  `;
  return rows as unknown as FeatureFlag[];
}

export async function createFlag(
  input: z.infer<typeof createFlagSchema>,
  source?: string | null,
): Promise<FeatureFlag> {
  const sql = getDb();
  const [flag] = await sql`
    INSERT INTO feature_flags (
      name,
      description,
      enabled,
      rollout_pct,
      rules,
      source
    )
    VALUES (
      ${input.name},
      ${input.description ?? null},
      ${input.enabled},
      ${input.rollout_pct},
      ${sql.json(input.rules as Parameters<typeof sql.json>[0])},
      ${source ?? null}
    )
    RETURNING *
  `;

  return flag as FeatureFlag;
}

export async function getFlagById(id: string): Promise<FeatureFlag | null> {
  const sql = getDb();
  const [flag] = await sql`
    SELECT *
    FROM feature_flags
    WHERE id = ${id}
      AND archived_at IS NULL
  `;

  return (flag as FeatureFlag | undefined) ?? null;
}

export async function updateFlag(
  id: string,
  updates: z.infer<typeof updateFlagSchema>,
): Promise<FeatureFlag | null> {
  const sql = getDb();
  const [existing] = await sql`
    SELECT *
    FROM feature_flags
    WHERE id = ${id}
      AND archived_at IS NULL
  `;

  if (!existing) return null;

  const enabled = updates.enabled ?? (existing.enabled as boolean);
  const rollout_pct = updates.rollout_pct ?? (existing.rollout_pct as number);
  const description =
    updates.description !== undefined
      ? updates.description
      : (existing.description as string | null);
  const rules = updates.rules !== undefined ? updates.rules : (existing.rules as Rule[]);

  const [updated] = await sql`
    UPDATE feature_flags
    SET enabled = ${enabled},
        rollout_pct = ${rollout_pct},
        description = ${description},
        rules = ${sql.json(rules as Parameters<typeof sql.json>[0])},
        updated_at = NOW()
    WHERE id = ${id}
      AND archived_at IS NULL
    RETURNING *
  `;

  return (updated as FeatureFlag | undefined) ?? null;
}

export async function archiveFlag(id: string): Promise<boolean> {
  const sql = getDb();
  const [updated] = await sql`
    UPDATE feature_flags
    SET archived_at = NOW(),
        updated_at = NOW()
    WHERE id = ${id}
      AND archived_at IS NULL
    RETURNING id
  `;

  return Boolean(updated);
}

export async function evaluateFlagForSubject(
  id: string,
  input: z.infer<typeof evaluateFlagSchema>,
): Promise<(EvaluationResult & { persistedBucket: number }) | null> {
  const flag = await getFlagById(id);
  if (!flag) return null;

  const evaluation = evaluateFlag(flag, input.subjectKey, input.context);
  const persistedBucket = evaluation.bucket ?? computeBucket(flag.name, input.subjectKey);

  const sql = getDb();
  await sql`
    INSERT INTO flag_evaluations (flag_id, fingerprint, bucket, result)
    VALUES (${id}, ${input.subjectKey}, ${persistedBucket}, ${evaluation.enabled})
  `;

  return { ...evaluation, persistedBucket };
}
