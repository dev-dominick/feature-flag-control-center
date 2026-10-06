import { NextResponse } from "next/server";
import {
  createFlag,
  createFlagSchema,
  createFlagsSchemaNotReadyResponse,
  isMissingFlagsSchemaError,
  listFlags,
} from "@/features/flags/server";
import { createApiErrorBody } from "@/lib/http/api-error";

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

    const source = request.headers.get("x-portfolio-test-run")
      ? "e2e"
      : null;

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
