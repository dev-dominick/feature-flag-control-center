import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFlagsSchemaNotReadyResponse,
  evaluateFlagForSubject,
  evaluateFlagSchema,
  isMissingFlagsSchemaError,
} from "@/features/flags/server";
import { createApiErrorBody } from "@/lib/http/api-error";

const idSchema = z.string().uuid();

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
