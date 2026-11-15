export class BizError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly causeData?: unknown,
    public readonly params: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "BizError";
  }
}

export class NetworkError extends Error {
  constructor(
    message = "Network error",
    public readonly causeData?: unknown,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class AuthError extends Error {
  constructor(
    message = "Unauthorized",
    public readonly causeData?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class ServerError extends Error {
  constructor(
    public readonly status: number,
    message = "Server error",
    public readonly causeData?: unknown,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

/**
 * Union of every error the shared axios pipeline can throw once its
 * interceptors run. All TanStack Query hooks in this template use this as
 * `TError` so callers can `instanceof`-narrow instead of relying on a lie.
 * Third-party mutation callbacks that throw plain `Error` or an `AxiosError`
 * that never reached our normalizer will still surface as `Error` — treat
 * those as unexpected and log to observability.
 */
export type HttpError = BizError | AuthError | NetworkError | ServerError;

export function isHttpError(value: unknown): value is HttpError {
  return (
    value instanceof BizError ||
    value instanceof AuthError ||
    value instanceof NetworkError ||
    value instanceof ServerError
  );
}
