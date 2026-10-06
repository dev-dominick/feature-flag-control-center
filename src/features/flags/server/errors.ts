import { NextResponse } from "next/server";
import { createApiErrorBody } from "@/lib/http/api-error";

const PG_UNDEFINED_TABLE = "42P01";

type PgLikeError = {
  code?: string;
  message?: string;
};

export function isMissingFlagsSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const pgError = error as PgLikeError;
  if (pgError.code !== PG_UNDEFINED_TABLE) {
    return false;
  }

  const message = String(pgError.message ?? "").toLowerCase();
  return (
    message.includes('relation "feature_flags"') ||
    message.includes('relation "flag_evaluations"') ||
    message.includes("relation feature_flags") ||
    message.includes("relation flag_evaluations")
  );
}

export function createFlagsSchemaNotReadyResponse(requestId: string) {
  return NextResponse.json(
    createApiErrorBody({
      code: "SCHEMA_NOT_READY",
      message:
        "Feature flag schema is not ready. Apply database migrations, including db/migrations/012_feature_flags.sql.",
      requestId,
      details: { component: "feature_flags", migration: "db/migrations/012_feature_flags.sql" },
    }),
    {
      status: 503,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}
