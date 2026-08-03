// Mandatory error handling rules (CLAUDE.md): every backend error is an
// AppError with a machine-readable code + HTTP status + optional details, all
// routes go through one global handler, every request carries a requestId,
// and production responses never expose stacks/SQL/keys/internal messages.

export type ErrorCode =
  | 'validation'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'internal';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  auth: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limit: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  // `message` is client-facing: keep it safe by construction (no internals).
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export type RequestContext = {
  requestId: string;
  /** Clerk user id once auth is wired in; null for guest requests. */
  userId: string | null;
};

type RouteHandler = (request: Request, ctx: RequestContext) => Promise<Response>;

function log(level: 'error' | 'warn', entry: Record<string, unknown>): void {
  const line = JSON.stringify({ level, ...entry });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

export function errorResponse(error: AppError, requestId: string): Response {
  const body: Record<string, unknown> = {
    code: error.code,
    message: error.message,
    requestId,
  };
  if (error.code === 'validation' && error.details !== undefined) {
    body.details = error.details;
  }
  return Response.json(body, {
    status: error.status,
    headers: { 'x-request-id': requestId },
  });
}

/**
 * Global error handler wrapper for Expo API routes. Generates the requestId,
 * logs full detail server-side (requestId, user, path, code, stack), and maps
 * anything thrown to a safe client response.
 */
export function withErrorHandler(path: string, handler: RouteHandler): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const requestId = globalThis.crypto.randomUUID();
    const ctx: RequestContext = { requestId, userId: null };
    try {
      const response = await handler(request, ctx);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError('internal', 'Something went wrong. Please try again.');
      log('error', {
        requestId,
        user: ctx.userId,
        path,
        code: appError.code,
        status: appError.status,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return errorResponse(appError, requestId);
    }
  };
}

/** Parse a JSON body or throw a validation AppError. */
export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('validation', 'Request body must be valid JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError('validation', 'Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}
