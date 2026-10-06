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

const idSchema = z.string().uuid();

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
