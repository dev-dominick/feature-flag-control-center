import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFlagsSchemaNotReadyResponse,
  getFlagById,
  evaluateFlagForSubject,
  evaluateFlagSchema,
  isMissingFlagsSchemaError,
} from "@/features/flags/server";
import { createApiErrorBody } from "@/lib/http/api-error";
import { consumeRateLimit } from "@/lib/http/rate-limit";

const idSchema = z.string().uuid();
const PUBLIC_DEMO_SOURCE = "public_demo";

function firstClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isAdminRequest(request: Request): boolean {
  const configuredToken = process.env.FFCC_ADMIN_TOKEN?.trim();
  const providedToken = request.headers.get("x-ffcc-admin-token")?.trim();
  if (!configuredToken || !providedToken) return false;
  return providedToken === configuredToken;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json(
      createApiErrorBody({
        code: "INVALID_ID",
        message: "Invalid flag ID",
        requestId,
      }),
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  try {
    if (!isAdminRequest(request)) {
      const rate = consumeRateLimit(
        `flags:evaluate:${firstClientIp(request)}`,
        60,
        5 * 60 * 1000,
      );
      if (!rate.allowed) {
        return NextResponse.json(
          createApiErrorBody({
            code: "RATE_LIMITED",
            message: "Too many evaluation requests. Please retry later.",
            requestId,
          }),
          {
            status: 429,
            headers: {
              "retry-after": String(rate.retryAfterSeconds),
              "x-request-id": requestId,
            },
          },
        );
      }
    }

    const existing = await getFlagById(id);
    if (!existing) {
      return NextResponse.json(
        createApiErrorBody({
          code: "NOT_FOUND",
          message: "Flag not found",
          requestId,
        }),
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }
    if (!isAdminRequest(request) && existing.source !== PUBLIC_DEMO_SOURCE) {
      return NextResponse.json(
        createApiErrorBody({
          code: "FORBIDDEN",
          message: "Public evaluation is limited to demo-scoped flags.",
          requestId,
        }),
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = evaluateFlagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createApiErrorBody({
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          requestId,
          details: {
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        }),
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const evaluation = await evaluateFlagForSubject(id, parsed.data);

    if (!evaluation) {
      return NextResponse.json(
        createApiErrorBody({
          code: "NOT_FOUND",
          message: "Flag not found",
          requestId,
        }),
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json(
      { evaluation },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    if (isMissingFlagsSchemaError(error)) {
      return createFlagsSchemaNotReadyResponse(requestId);
    }

    return NextResponse.json(
      createApiErrorBody({
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId,
      }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
