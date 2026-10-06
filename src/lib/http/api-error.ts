export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export function createApiErrorBody(input: {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}): ApiErrorBody {
  return {
    error: {
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };
}
