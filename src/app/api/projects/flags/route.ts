import { NextResponse } from "next/server";
import {
  countActiveFlagsBySource,
  createFlag,
  createFlagSchema,
  createFlagsSchemaNotReadyResponse,
  isMissingFlagsSchemaError,
  listFlags,
} from "@/features/flags/server";
import { createApiErrorBody } from "@/lib/http/api-error";
import { consumeRateLimit } from "@/lib/http/rate-limit";

const PUBLIC_DEMO_SOURCE = "public_demo";
const PUBLIC_FLAG_CAP = 120;

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

function resolveCreateSource(request: Request): string | null {
  if (request.headers.get("x-portfolio-test-run")) return "e2e";
  if (isAdminRequest(request)) return null;
  return PUBLIC_DEMO_SOURCE;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object"
    ? (error as { code?: string }).code
    : undefined;
}

export async function GET(request: Request) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const flags = await listFlags();

    return NextResponse.json(
      { flags },
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

export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();

  try {
    if (!isAdminRequest(request)) {
      const rate = consumeRateLimit(
        `flags:create:${firstClientIp(request)}`,
        12,
        5 * 60 * 1000,
      );
      if (!rate.allowed) {
        return NextResponse.json(
          createApiErrorBody({
            code: "RATE_LIMITED",
            message: "Too many flag create requests. Please retry later.",
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

    const body = await request.json().catch(() => null);
    const parsed = createFlagSchema.safeParse(body);

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

    const source = resolveCreateSource(request);
    if (source === PUBLIC_DEMO_SOURCE) {
      const count = await countActiveFlagsBySource(PUBLIC_DEMO_SOURCE);
      if (count >= PUBLIC_FLAG_CAP) {
        return NextResponse.json(
          createApiErrorBody({
            code: "DEMO_CAP_REACHED",
            message: "Public demo capacity is full. Please retry later.",
            requestId,
          }),
          { status: 429, headers: { "x-request-id": requestId } },
        );
      }
    }

    const flag = await createFlag(parsed.data, source);

    return NextResponse.json(
      { success: true, flag },
      {
        status: 201,
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

    if (errorCode(error) === "23505") {
      return NextResponse.json(
        createApiErrorBody({
          code: "CONFLICT",
          message: "A flag with that name already exists",
          requestId,
        }),
        { status: 409, headers: { "x-request-id": requestId } },
      );
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
