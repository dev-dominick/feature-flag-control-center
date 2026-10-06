"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureFlag, Rule } from "@/features/flags";
import { computeBucket } from "@/features/flags/utils/bucket";
import { evaluateFlag } from "@/features/flags/utils/evaluate";

type FlagRow = FeatureFlag & { created_at: string | Date; updated_at: string | Date };

type EvaluationResult = {
  enabled: boolean;
  bucket: number | null;
  rule_matched: string | null;
  persistedBucket: number;
};

type ApiFieldErrors = Partial<Record<string, string[] | undefined>>;

type ApiErrorDetails = {
  fieldErrors?: ApiFieldErrors;
};

type ApiError = { error?: { code?: string; message?: string; details?: ApiErrorDetails } };

type ApiFailure = {
  code?: string;
  message: string;
  status: number;
  details?: ApiErrorDetails;
};

type LastEvaluation = {
  flagName: string;
  subjectKey: string;
  contextRaw: string;
  result: EvaluationResult;
  rolloutPct: number;
};

type PreviewFeatureState = {
  status: "ready" | "error";
  result?: EvaluationResult;
  error?: string;
};

type PreviewFeatureMeta = {
  title: string;
  summary: string;
};

const PREVIEW_FEATURE_META: Record<string, PreviewFeatureMeta> = {
  checkout_v2: {
    title: "New checkout experience",
    summary: "Modernized checkout with fewer steps and clearer payment validation.",
  },
  ai_suggestions: {
    title: "AI suggestions",
    summary: "Personalized recommendations driven by customer behavior and intent.",
  },
  team_dashboard: {
    title: "Team dashboard",
    summary: "Shared workspace for account-level metrics, tasks, and release visibility.",
  },
};

const EMPTY_RULES: Rule[] = [];

function normalizeFlag(row: FlagRow): FeatureFlag {
  return {
    ...row,
    rules: Array.isArray(row.rules) ? row.rules : EMPTY_RULES,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

function isSchemaUnavailableError(failure: ApiFailure): boolean {
  return failure.status === 503 && failure.code === "SCHEMA_NOT_READY";
}

async function parseApiError(response: Response): Promise<ApiFailure> {
  const payload = (await response.json().catch(() => ({}))) as ApiError;
  return {
    code: payload.error?.code,
    message: payload.error?.message || "Request failed",
    status: response.status,
    details: payload.error?.details,
  };
}

function firstFieldError(fieldErrors: ApiFieldErrors | undefined, field: string): string | null {
  const value = fieldErrors?.[field];
  return Array.isArray(value) && value.length > 0 ? (value[0] ?? null) : null;
}

function sortFlagsByCreatedAndId(rows: FeatureFlag[]): FeatureFlag[] {
  return [...rows].sort((a, b) => {
    const createdDelta = a.created_at.getTime() - b.created_at.getTime();
    if (createdDelta !== 0) return createdDelta;
    return a.id.localeCompare(b.id);
  });
}

function formatUpdatedAt(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function toPreviewFeatureMeta(flagName: string): PreviewFeatureMeta {
  if (!flagName || typeof flagName !== "string") {
    return {
      title: "Unnamed Feature",
      summary: "Controlled by a persisted feature flag.",
    };
  }

  const known = PREVIEW_FEATURE_META[flagName];
  if (known) return known;

  const title = flagName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    title,
    summary: `Controlled by persisted flag ${flagName}.`,
  };
}

function isFullFlagRow(value: unknown): value is FlagRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<FlagRow>;
  return Boolean(
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    row.created_at !== undefined &&
    row.updated_at !== undefined,
  );
}

function toContextScalar(
  context: Record<string, unknown>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return fallback;
}

function parseContextInput(raw: string): {
  context: Record<string, unknown>;
  error: string | null;
} {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { context: parsed as Record<string, unknown>, error: null };
    }
    return {
      context: {},
      error: "Evaluation context must be a JSON object.",
    };
  } catch {
    return {
      context: {},
      error: "Evaluation context must be valid JSON.",
    };
  }
}

function toStringContext(context: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, String(value)]),
  );
}

function evaluationSummary(
  subjectKey: string,
  flag: FeatureFlag,
  result: EvaluationResult,
): string {
  const bucket = result.persistedBucket;
  const rollout = `${flag.rollout_pct}%`;
  if (!flag.enabled) {
    return `${subjectKey} → bucket ${bucket} → rollout ${rollout} → disabled because the flag is off.`;
  }

  if (result.rule_matched) {
    return `${subjectKey} → bucket ${bucket} → rollout ${rollout} → enabled because rule ${result.rule_matched} matched.`;
  }

  return `${subjectKey} → bucket ${bucket} → rollout ${rollout} → ${
    result.enabled ? "enabled" : "disabled"
  } because the bucket ${result.enabled ? "falls below" : "meets or exceeds"} the threshold.`;
}

export function FlagsControlCenter() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaUnavailable, setSchemaUnavailable] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFieldErrors, setCreateFieldErrors] = useState<Partial<Record<string, string>>>({});

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [archiving, setArchiving] = useState<Record<string, boolean>>({});
  const [rolloutDraft, setRolloutDraft] = useState<Record<string, number>>({});
  const [rowFieldErrors, setRowFieldErrors] = useState<
    Record<string, Partial<Record<string, string>>>
  >({});
  const [archiveDialogFlagId, setArchiveDialogFlagId] = useState<string | null>(null);

  const [subjectKey, setSubjectKey] = useState("user_demo_001");
  const [evaluationContext, setEvaluationContext] = useState('{"tier":"pro","region":"us-east"}');
  const [evaluating, setEvaluating] = useState<Record<string, boolean>>({});
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationResult>>({});
  const [evaluationFieldError, setEvaluationFieldError] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<LastEvaluation | null>(null);

  const enabledCount = useMemo(() => flags.filter((flag) => flag.enabled).length, [flags]);
  const sortedFlags = useMemo(() => sortFlagsByCreatedAndId(flags), [flags]);
  const parsedEvaluationContext = useMemo(
    () => parseContextInput(evaluationContext),
    [evaluationContext],
  );

  const previewEnvironment = useMemo(() => {
    const context = parsedEvaluationContext.context;
    return {
      subject: subjectKey.trim() || "(empty)",
      plan: toContextScalar(context, ["plan", "tier"], "free"),
      region: toContextScalar(context, ["region", "geo", "locale"], "global"),
      accountType: toContextScalar(context, ["accountType", "account_type"], "individual"),
      betaStatus: toContextScalar(context, ["beta", "isBeta", "betaUser"], "false"),
    };
  }, [parsedEvaluationContext.context, subjectKey]);

  const previewEvaluation = useMemo(() => {
    if (sortedFlags.length === 0) {
      return {
        features: {} as Record<string, PreviewFeatureState>,
        error: null as string | null,
      };
    }

    if (!subjectKey.trim()) {
      return {
        features: {} as Record<string, PreviewFeatureState>,
        error: "Subject key is required to evaluate product preview features.",
      };
    }

    if (parsedEvaluationContext.error) {
      return {
        features: {} as Record<string, PreviewFeatureState>,
        error: parsedEvaluationContext.error,
      };
    }

    const context = toStringContext(parsedEvaluationContext.context);
    const features: Record<string, PreviewFeatureState> = {};

    for (const flag of sortedFlags) {
      const evaluated = evaluateFlag(flag, subjectKey.trim(), context);
      features[flag.id] = {
        status: "ready",
        result: {
          enabled: evaluated.enabled,
          bucket: evaluated.bucket,
          rule_matched: evaluated.rule_matched,
          persistedBucket: evaluated.bucket ?? computeBucket(flag.name, subjectKey.trim()),
        },
      };
    }

    return {
      features,
      error: null as string | null,
    };
  }, [parsedEvaluationContext.context, parsedEvaluationContext.error, sortedFlags, subjectKey]);

  const previewFeatures = previewEvaluation.features;
  const previewError = previewEvaluation.error;

  const loadFlags = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/flags", { cache: "no-store" });
      if (!res.ok) {
        const failure = await parseApiError(res);
        setError(failure.message);
        setSchemaUnavailable(isSchemaUnavailableError(failure));
        return;
      }

      const data = (await res.json()) as { flags: FlagRow[] };
      setFlags(data.flags.map(normalizeFlag));
      setSchemaUnavailable(false);
      setError(null);
    } catch {
      setError("We could not refresh flags right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the flag data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFlags();
  }, [loadFlags]);

  function setFlagOptimistic(
    id: string,
    patch: Partial<Pick<FeatureFlag, "enabled" | "rollout_pct" | "rules" | "description">>,
  ): FeatureFlag | null {
    const current = flags.find((flag) => flag.id === id);
    if (!current) return null;

    const optimistic: FeatureFlag = {
      ...current,
      ...patch,
      updated_at: new Date(),
    };

    setFlags((prev) => prev.map((flag) => (flag.id === id ? optimistic : flag)));
    return current;
  }

  function restoreFlag(id: string, previous: FeatureFlag | null) {
    if (!previous) return;
    setFlags((prev) => prev.map((flag) => (flag.id === id ? previous : flag)));
  }

  function reconcileFlag(id: string, incoming: FlagRow) {
    const normalized = normalizeFlag(incoming);
    setFlags((prev) => prev.map((flag) => (flag.id === id ? normalized : flag)));
  }

  async function createNewFlag(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreateFieldErrors({});

    try {
      const res = await fetch("/api/projects/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          enabled: false,
          rollout_pct: 0,
          rules: [],
        }),
      });

      if (!res.ok) {
        const failure = await parseApiError(res);
        setError(failure.message);
        setSchemaUnavailable(isSchemaUnavailableError(failure));
        setCreateFieldErrors({
          name: firstFieldError(failure.details?.fieldErrors, "name") ?? undefined,
          description: firstFieldError(failure.details?.fieldErrors, "description") ?? undefined,
        });
        return;
      }

      setSchemaUnavailable(false);
      setName("");
      setDescription("");
      setCreateFieldErrors({});
      await loadFlags();
    } catch {
      setError("We could not create this flag. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function updateFlag(
    id: string,
    patch: Partial<Pick<FeatureFlag, "enabled" | "rollout_pct" | "rules" | "description">>,
  ) {
    const previous = setFlagOptimistic(id, patch);
    setSaving((prev) => ({ ...prev, [id]: true }));
    setError(null);
    setRowFieldErrors((prev) => ({ ...prev, [id]: {} }));

    try {
      const res = await fetch(`/api/projects/flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const failure = await parseApiError(res);
        setError(failure.message);
        setSchemaUnavailable(isSchemaUnavailableError(failure));
        restoreFlag(id, previous);
        setRowFieldErrors((prev) => ({
          ...prev,
          [id]: {
            enabled: firstFieldError(failure.details?.fieldErrors, "enabled") ?? undefined,
            rollout_pct: firstFieldError(failure.details?.fieldErrors, "rollout_pct") ?? undefined,
            description: firstFieldError(failure.details?.fieldErrors, "description") ?? undefined,
            rules: firstFieldError(failure.details?.fieldErrors, "rules") ?? undefined,
          },
        }));
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as { flag?: unknown };
      setSchemaUnavailable(false);
      setRowFieldErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (isFullFlagRow(payload.flag)) {
        reconcileFlag(id, payload.flag);
      } else {
        void loadFlags();
      }

      if (patch.rollout_pct !== undefined) {
        setRolloutDraft((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } catch {
      restoreFlag(id, previous);
      setError("We could not save this flag update. Please try again.");
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function archiveFlag(id: string) {
    setArchiving((prev) => ({ ...prev, [id]: true }));
    setError(null);

    try {
      const res = await fetch(`/api/projects/flags/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const failure = await parseApiError(res);
        setError(failure.message);
        setSchemaUnavailable(isSchemaUnavailableError(failure));
        return;
      }

      setArchiveDialogFlagId(null);
      await loadFlags();
    } catch {
      setError("We could not archive this flag. Please try again.");
    } finally {
      setArchiving((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function evaluateFlagForSubject(flagId: string) {
    setEvaluating((prev) => ({ ...prev, [flagId]: true }));
    setError(null);
    setEvaluationFieldError(null);

    if (parsedEvaluationContext.error) {
      setError(parsedEvaluationContext.error);
      setEvaluationFieldError(parsedEvaluationContext.error);
      setEvaluating((prev) => ({ ...prev, [flagId]: false }));
      return;
    }
    const context = parsedEvaluationContext.context as Record<string, string>;

    try {
      const res = await fetch(`/api/projects/flags/${flagId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectKey, context }),
      });

      if (!res.ok) {
        const failure = await parseApiError(res);
        setError(failure.message);
        setSchemaUnavailable(isSchemaUnavailableError(failure));
        return;
      }

      const data = (await res.json()) as { evaluation?: EvaluationResult };
      if (!data.evaluation) {
        setError("Evaluation response was missing required data.");
        return;
      }
      const evaluation = data.evaluation;
      setSchemaUnavailable(false);
      setEvaluations((prev) => ({ ...prev, [flagId]: evaluation }));
      const flag = flags.find((item) => item.id === flagId);
      if (flag) {
        setLastEvaluation({
          flagName: flag.name,
          subjectKey: subjectKey.trim(),
          contextRaw: evaluationContext,
          result: evaluation,
          rolloutPct: flag.rollout_pct,
        });
      }
    } catch {
      setError("We could not run this evaluation. Please try again.");
    } finally {
      setEvaluating((prev) => ({ ...prev, [flagId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary) sm:text-3xl">
          Feature Flag Control Center
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          Deterministic rollout evaluation backed by persisted PostgreSQL flag rules.
        </p>
        <p className="mt-3 inline-flex items-center rounded border border-(--accent)/30 bg-(--accent)/10 px-2.5 py-1 text-[11px] font-medium text-(--accent)">
          Full-stack mode: {enabledCount}/{flags.length} enabled
        </p>
      </div>
      {schemaUnavailable && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <span>Feature flag schema is currently unavailable.</span>
          <button
            onClick={() => void loadFlags()}
            className="rounded border border-amber-300/40 px-2 py-0.5 text-xs text-amber-100 hover:bg-amber-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Could not complete the last request. {error}
        </div>
      )}

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">Create flag</h2>
        <form onSubmit={createNewFlag} className="space-y-3">
          <div>
            <label
              htmlFor="flag-key-input"
              className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
            >
              Flag key
            </label>
            <input
              id="flag-key-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="flag_example"
              aria-invalid={Boolean(createFieldErrors.name)}
              aria-describedby={createFieldErrors.name ? "flag-key-error" : undefined}
              className="w-full rounded border border-(--border-default) bg-(--surface-base) px-3 py-2 text-sm text-(--text-primary)"
              required
            />
          </div>
          <div>
            <label
              htmlFor="flag-description-input"
              className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
            >
              Description
            </label>
            <input
              id="flag-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this flag controls"
              aria-invalid={Boolean(createFieldErrors.description)}
              aria-describedby={
                createFieldErrors.description ? "flag-description-error" : undefined
              }
              className="w-full rounded border border-(--border-default) bg-(--surface-base) px-3 py-2 text-sm text-(--text-primary)"
            />
          </div>
          <button
            type="submit"
            disabled={creating || schemaUnavailable}
            className="rounded border border-(--border-default) bg-(--nebula-muted) px-3 py-2 text-sm font-medium text-(--nebula) disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
        <div className="mt-2 space-y-1">
          {createFieldErrors.name && (
            <p id="flag-key-error" className="text-xs text-red-300">
              {createFieldErrors.name}
            </p>
          )}
          {createFieldErrors.description && (
            <p id="flag-description-error" className="text-xs text-red-300">
              {createFieldErrors.description}
            </p>
          )}
        </div>
      </section>

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">Evaluation context</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="flag-subject-key"
              className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
            >
              Subject key
            </label>
            <input
              id="flag-subject-key"
              value={subjectKey}
              onChange={(e) => setSubjectKey(e.target.value)}
              placeholder="user_123"
              className="w-full rounded border border-(--border-default) bg-(--surface-base) px-3 py-2 text-sm text-(--text-primary)"
            />
          </div>
          <div>
            <label
              htmlFor="flag-context"
              className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
            >
              Context (JSON)
            </label>
            <input
              id="flag-context"
              value={evaluationContext}
              onChange={(e) => setEvaluationContext(e.target.value)}
              placeholder='{"tier":"pro"}'
              aria-invalid={Boolean(evaluationFieldError)}
              aria-describedby={evaluationFieldError ? "evaluation-context-error" : undefined}
              className="w-full font-mono rounded border border-(--border-default) bg-(--surface-base) px-3 py-2 text-xs text-(--text-primary)"
            />
          </div>
        </div>
        {evaluationFieldError && (
          <p id="evaluation-context-error" className="mt-2 text-xs text-red-300">
            {evaluationFieldError}
          </p>
        )}
        <div className="mt-3 rounded border border-(--border-subtle) bg-(--surface-base) p-3 text-xs text-(--text-secondary) space-y-1">
          <p className="font-medium text-(--text-primary)">Deterministic rollout behavior</p>
          <p>
            For the same flag and subject key, the bucket stays stable. The result changes only if
            rollout percentage, rules, or enabled state changes.
          </p>
          {lastEvaluation ? (
            <div className="rounded border border-(--border-subtle) bg-(--surface-overlay)/60 p-2 text-(--text-muted) space-y-1">
              <p>
                Subject:{" "}
                <span className="font-mono text-(--text-secondary)">
                  {lastEvaluation.subjectKey}
                </span>
              </p>
              <p>
                Context:{" "}
                <span className="font-mono text-(--text-secondary)">
                  {lastEvaluation.contextRaw}
                </span>
              </p>
              <p>
                Result: {lastEvaluation.result.enabled ? "Enabled" : "Disabled"} for{" "}
                <span className="font-mono text-(--text-secondary)">{lastEvaluation.flagName}</span>
              </p>
              <p>
                Bucket {lastEvaluation.result.persistedBucket} compared to rollout{" "}
                {lastEvaluation.rolloutPct}%
                {lastEvaluation.result.rule_matched
                  ? `, with rule ${lastEvaluation.result.rule_matched} matched.`
                  : "."}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <h2 className="mb-2 text-sm font-semibold text-(--text-primary)">Product preview</h2>
        <p className="text-xs text-(--text-secondary)">
          Feature flags let teams ship code separately from releasing features. This preview
          evaluates the current user against persisted rollout rules and shows which product
          features would be available.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-[11px]">
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-2.5 py-2">
            <p className="text-(--text-muted)">Subject key</p>
            <p className="mt-1 font-mono text-(--text-secondary) wrap-break-word">
              {previewEnvironment.subject}
            </p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-2.5 py-2">
            <p className="text-(--text-muted)">Plan</p>
            <p className="mt-1 font-medium text-(--text-secondary)">{previewEnvironment.plan}</p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-2.5 py-2">
            <p className="text-(--text-muted)">Region</p>
            <p className="mt-1 font-medium text-(--text-secondary)">{previewEnvironment.region}</p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-2.5 py-2">
            <p className="text-(--text-muted)">Account type</p>
            <p className="mt-1 font-medium text-(--text-secondary)">
              {previewEnvironment.accountType}
            </p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-2.5 py-2">
            <p className="text-(--text-muted)">Beta status</p>
            <p className="mt-1 font-medium text-(--text-secondary)">
              {previewEnvironment.betaStatus}
            </p>
          </div>
        </div>

        {previewError && <p className="mt-3 text-xs text-red-300">{previewError}</p>}

        {sortedFlags.length === 0 ? (
          <p className="mt-3 text-xs text-(--text-muted)">
            Create persisted flags to see product capabilities appear in this preview.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {sortedFlags.map((flag) => {
              const preview = previewFeatures[flag.id];
              const meta = toPreviewFeatureMeta(flag.name);
              const isEnabled = preview?.status === "ready" && Boolean(preview.result?.enabled);
              const bucket = preview?.result?.persistedBucket;

              return (
                <article
                  key={`preview-${flag.id}`}
                  className={`rounded border px-3 py-3 ${
                    isEnabled
                      ? "border-(--tone-blue)/40 bg-(--tone-blue)/10"
                      : "border-(--border-subtle) bg-(--surface-base)"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-(--text-primary) wrap-break-word">
                        {meta.title}
                      </h3>
                      <p className="mt-1 text-xs text-(--text-secondary) wrap-break-word">
                        {meta.summary}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                        isEnabled
                          ? "border-(--tone-blue)/40 text-(--tone-blue)"
                          : "border-(--border-subtle) text-(--text-muted)"
                      }`}
                    >
                      {isEnabled ? "Visible" : "Locked"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-(--text-muted)">
                    {preview?.status === "error"
                      ? `Preview unavailable: ${preview.error}`
                      : preview?.status === "ready"
                        ? !flag.enabled
                          ? `Hidden because ${flag.name} is disabled.`
                          : preview.result?.rule_matched
                            ? `Visible because rule ${preview.result.rule_matched} matched.`
                            : preview.result?.enabled
                              ? `Visible because bucket ${bucket} is inside rollout ${flag.rollout_pct}%.`
                              : `Hidden because bucket ${bucket} is outside rollout ${flag.rollout_pct}%.`
                        : "Run an evaluation to see rollout reasoning."}
                  </p>
                  <p className="mt-1 text-[11px] text-(--text-muted)">
                    Flag key: <span className="font-mono">{flag.name}</span>
                    {preview?.status === "ready" ? ` · Bucket ${bucket}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--text-primary)">Persisted flags</h2>
          <button
            onClick={() => void loadFlags()}
            className="rounded border border-(--border-default) px-3 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary)"
          >
            {schemaUnavailable ? "Retry" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2" aria-label="Loading flags">
            {[0, 1, 2].map((idx) => (
              <div
                key={`flags-skeleton-${idx}`}
                className="h-24 rounded border border-(--border-subtle) bg-(--surface-base)/70 animate-pulse"
              />
            ))}
          </div>
        ) : sortedFlags.length === 0 ? (
          <p className="text-sm text-(--text-muted)">
            No flags yet. Create your first flag key above to test deterministic rollout behavior.
          </p>
        ) : (
          <div className="space-y-2">
            {sortedFlags.map((flag) => {
              const draftRollout = rolloutDraft[flag.id] ?? flag.rollout_pct;
              const result = evaluations[flag.id];

              return (
                <div
                  key={flag.id}
                  className="min-w-0 rounded border border-(--border-subtle) bg-(--surface-base) p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-mono text-sm font-semibold text-(--text-primary) wrap-break-word">
                        {flag.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded border border-(--border-subtle) px-1.5 py-0.5 text-(--text-secondary)">
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <span className="rounded border border-(--border-subtle) px-1.5 py-0.5 text-(--text-secondary)">
                          Rollout {flag.rollout_pct}%
                        </span>
                        <span className="rounded border border-(--border-subtle) px-1.5 py-0.5 text-(--text-secondary)">
                          Rules {flag.rules.length}
                        </span>
                        <span className="rounded border border-(--border-subtle) px-1.5 py-0.5 text-(--text-muted)">
                          Updated {formatUpdatedAt(flag.updated_at)}
                        </span>
                      </div>
                      {flag.description && (
                        <p className="mt-1 text-xs text-(--text-muted) wrap-break-word">
                          {flag.description}
                        </p>
                      )}
                    </div>
                    <button
                      role="switch"
                      aria-checked={flag.enabled}
                      aria-label={`${flag.enabled ? "Disable" : "Enable"} ${flag.name}`}
                      onClick={() => void updateFlag(flag.id, { enabled: !flag.enabled })}
                      disabled={saving[flag.id] || schemaUnavailable}
                      className={`relative h-5 w-9 self-start rounded-full transition-colors ${
                        flag.enabled ? "bg-(--accent)" : "bg-(--border-default)"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 translate-y-0 rounded-full bg-white shadow transition-transform ${
                          flag.enabled ? "translate-x-4.5 ml-0" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3">
                    <label className="text-[11px] text-(--text-muted)">
                      Rollout {draftRollout}%
                    </label>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={draftRollout}
                        onChange={(e) =>
                          setRolloutDraft((prev) => ({
                            ...prev,
                            [flag.id]: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-(--accent)"
                      />
                      <button
                        onClick={() => void updateFlag(flag.id, { rollout_pct: draftRollout })}
                        disabled={saving[flag.id] || schemaUnavailable}
                        className="w-full rounded border border-(--border-default) px-2 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary) sm:w-auto"
                      >
                        Save
                      </button>
                    </div>
                    {rowFieldErrors[flag.id]?.rollout_pct && (
                      <p className="mt-1 text-xs text-red-300">
                        {rowFieldErrors[flag.id]?.rollout_pct}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      onClick={() => void evaluateFlagForSubject(flag.id)}
                      disabled={evaluating[flag.id] || !subjectKey.trim() || schemaUnavailable}
                      className="w-full rounded border border-(--border-default) px-2 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary) disabled:opacity-50 sm:w-auto"
                    >
                      {evaluating[flag.id] ? "Evaluating…" : "Evaluate subject"}
                    </button>
                    <Dialog.Root
                      open={archiveDialogFlagId === flag.id}
                      onOpenChange={(open) => setArchiveDialogFlagId(open ? flag.id : null)}
                    >
                      <Dialog.Trigger asChild>
                        <button
                          type="button"
                          className="w-full rounded border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 sm:w-auto"
                        >
                          Archive
                        </button>
                      </Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
                        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded border border-(--border-default) bg-(--surface-raised) p-4 shadow-(--shadow-lg) focus:outline-none">
                          <Dialog.Title className="text-sm font-semibold text-(--text-primary)">
                            Archive flag
                          </Dialog.Title>
                          <Dialog.Description className="mt-2 text-xs text-(--text-secondary)">
                            Archive <span className="font-mono">{flag.name}</span> to remove it from
                            the active demo list.
                          </Dialog.Description>
                          <div className="mt-4 flex justify-end gap-2">
                            <Dialog.Close asChild>
                              <button
                                type="button"
                                className="rounded border border-(--border-default) px-2 py-1 text-xs text-(--text-secondary)"
                              >
                                Cancel
                              </button>
                            </Dialog.Close>
                            <button
                              type="button"
                              onClick={() => void archiveFlag(flag.id)}
                              disabled={archiving[flag.id]}
                              className="rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 disabled:opacity-50"
                            >
                              {archiving[flag.id] ? "Archiving…" : "Archive"}
                            </button>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                    {result && (
                      <div className="min-w-0 space-y-1 text-xs text-(--text-muted) wrap-break-word">
                        <span>
                          {result.enabled ? "Enabled" : "Disabled"} · bucket{" "}
                          {result.persistedBucket} · rollout {draftRollout}%
                          {result.rule_matched ? ` · rule ${result.rule_matched}` : ""}
                        </span>
                        <span>{evaluationSummary(subjectKey.trim(), flag, result)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
