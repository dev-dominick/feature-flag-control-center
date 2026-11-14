import { NextResponse } from "next/server";
import { z } from "zod";
import {
  archiveFlag,
  createFlagsSchemaNotReadyResponse,
  getFlagById,
  isMissingFlagsSchemaError,
  updateFlag,
  updateFlagSchema,
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

function invalidId(requestId: string) {
  return NextResponse.json(
    createApiErrorBody({
      code: "INVALID_ID",
      message: "Invalid flag ID",
      requestId,
    }),
    { status: 400, headers: { "x-request-id": requestId } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return invalidId(requestId);
  }

  try {
    const flag = await getFlagById(id);

    if (!flag) {
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
      { flag },
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return invalidId(requestId);
  }

  try {
    if (!isAdminRequest(request)) {
      const rate = consumeRateLimit(
        `flags:patch:${firstClientIp(request)}`,
        30,
        5 * 60 * 1000,
      );
      if (!rate.allowed) {
        return NextResponse.json(
          createApiErrorBody({
            code: "RATE_LIMITED",
            message: "Too many update requests. Please retry later.",
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
          message: "Only demo-scoped flags are mutable in public mode.",
          requestId,
        }),
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateFlagSchema.safeParse(body);

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

    const flag = await updateFlag(id, parsed.data);

    if (!flag) {
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
      { success: true, flag },
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return invalidId(requestId);
  }

  try {
    if (!isAdminRequest(request)) {
      const rate = consumeRateLimit(
        `flags:delete:${firstClientIp(request)}`,
        12,
        5 * 60 * 1000,
      );
      if (!rate.allowed) {
        return NextResponse.json(
          createApiErrorBody({
            code: "RATE_LIMITED",
            message: "Too many archive requests. Please retry later.",
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
          message: "Only demo-scoped flags are archivable in public mode.",
          requestId,
        }),
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }

    const archived = await archiveFlag(id);

    if (!archived) {
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
      { success: true, id },
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
