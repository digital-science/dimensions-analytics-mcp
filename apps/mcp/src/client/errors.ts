/**
 * Base error class for all Dimensions API errors.
 * Provides consistent error structure with optional status codes and JSON serialization.
 */
export class DimensionsError extends Error {
  /** HTTP status code associated with this error, if applicable */
  readonly statusCode?: number;

  /**
   * Creates a new DimensionsError.
   * @param message - Human-readable error description
   * @param statusCode - Optional HTTP status code
   */
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "DimensionsError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes the error to a plain object for logging or API responses.
   * @returns Plain object representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Thrown when authentication fails (invalid API key, expired token, etc.).
 * HTTP Status: 401 Unauthorized
 */
export class AuthenticationError extends DimensionsError {
  /**
   * Creates a new AuthenticationError.
   * @param message - Error description (defaults to "Authentication failed")
   */
  constructor(message: string = "Authentication failed") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Client-side rate-limit state surfaced on 429 errors.
 * Dimensions does not send rate-limit response headers; this reflects local throttling.
 */
export interface ClientRateLimitInfo {
  /** Requests remaining in the client sliding window */
  readonly remaining: number;
  /** Suggested wait before retrying, in milliseconds */
  readonly retryAfterMs: number;
}

/**
 * Thrown when the API rate limit is exceeded.
 * HTTP Status: 429 Too Many Requests
 */
export class RateLimitError extends DimensionsError {
  /** Suggested seconds to wait before retrying (from client-side throttling) */
  readonly retryAfter?: number;
  /** Client-side rate-limit state when a rate limiter is configured */
  readonly clientRateLimit?: ClientRateLimitInfo;

  /**
   * Creates a new RateLimitError.
   * @param message - Error description (defaults to "Rate limit exceeded")
   * @param retryAfterSeconds - Suggested seconds to wait before retrying
   * @param clientRateLimit - Optional client-side rate-limit snapshot
   */
  constructor(
    message: string = "Rate limit exceeded",
    retryAfterSeconds?: number,
    clientRateLimit?: ClientRateLimitInfo,
  ) {
    super(message, 429);
    this.name = "RateLimitError";
    this.clientRateLimit = clientRateLimit;
    this.retryAfter =
      retryAfterSeconds ??
      (clientRateLimit != null ? Math.ceil(clientRateLimit.retryAfterMs / 1000) : undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      clientRateLimit: this.clientRateLimit,
    };
  }
}

/**
 * Thrown when input validation fails (invalid parameters, missing required fields, etc.).
 * HTTP Status: 400 Bad Request
 */
export class ValidationError extends DimensionsError {
  /** Additional details about what failed validation */
  readonly details?: Record<string, unknown>;

  /**
   * Creates a new ValidationError.
   * @param message - Error description
   * @param details - Optional object with validation failure details
   */
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400);
    this.name = "ValidationError";
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * Thrown when the DSL query syntax is invalid.
 * HTTP Status: 400 Bad Request
 */
export class QuerySyntaxError extends DimensionsError {
  /**
   * Creates a new QuerySyntaxError.
   * @param message - Description of the syntax error
   */
  constructor(message: string) {
    super(message, 400);
    this.name = "QuerySyntaxError";
  }
}

/**
 * Thrown when a network-level error occurs (connection refused, DNS failure, etc.).
 * No HTTP status code as the request never completed.
 */
export class NetworkError extends DimensionsError {
  /**
   * Creates a new NetworkError.
   * @param message - Error description (defaults to "Network error")
   */
  constructor(message: string = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Thrown when a request times out before receiving a response.
 * No HTTP status code as the request never completed.
 */
export class TimeoutError extends DimensionsError {
  /**
   * Creates a new TimeoutError.
   * @param message - Error description (defaults to "Request timeout")
   */
  constructor(message: string = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Thrown when the server returns a 5xx error.
 * HTTP Status: 500-599 (configurable, defaults to 500)
 */
export class ServerError extends DimensionsError {
  /**
   * Creates a new ServerError.
   * @param message - Error description (defaults to "Server error")
   * @param statusCode - HTTP status code in range 500-599 (defaults to 500)
   * @throws {TypeError} If statusCode is not an integer in range 500-599
   */
  constructor(message: string = "Server error", statusCode: number = 500) {
    if (!Number.isInteger(statusCode) || statusCode < 500 || statusCode > 599) {
      throw new TypeError(
        `ServerError statusCode must be an integer in range 500-599, got ${statusCode}`,
      );
    }
    super(message, statusCode);
    this.name = "ServerError";
  }
}

/**
 * Thrown when a requested resource is not found.
 * HTTP Status: 404 Not Found
 */
export class NotFoundError extends DimensionsError {
  /**
   * Creates a new NotFoundError.
   * @param message - Error description (defaults to "Resource not found")
   */
  constructor(message: string = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when the request is syntactically valid but contains invalid data.
 * HTTP Status: 422 Unprocessable Entity
 */
export class UnprocessableEntityError extends DimensionsError {
  /** Additional details about what failed processing */
  readonly details?: Record<string, unknown>;

  /**
   * Creates a new UnprocessableEntityError.
   * @param message - Error description
   * @param details - Optional object with processing failure details
   */
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 422);
    this.name = "UnprocessableEntityError";
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * Checks if an error is a DimensionsError instance.
 * @param error - Value to check
 * @returns True if error is a DimensionsError
 */
export function isDimensionsError(error: unknown): error is DimensionsError {
  return error instanceof DimensionsError;
}

/**
 * Checks if an error is a NotFoundError instance.
 * @param error - Value to check
 * @returns True if error is a NotFoundError
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * Checks if an error is an UnprocessableEntityError instance.
 * @param error - Value to check
 * @returns True if error is an UnprocessableEntityError
 */
export function isUnprocessableEntityError(error: unknown): error is UnprocessableEntityError {
  return error instanceof UnprocessableEntityError;
}

/**
 * Exhaustiveness check for discriminated unions.
 * Local copy to keep `core` free of `dimensions-dsl` dependency.
 * @param value - Should be `never` at compile time
 * @param message - Optional error message
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

/** Patterns that match credentials in error messages, paired with their replacements */
const CREDENTIAL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/:\/\/([^:]+):([^@]+)@/g, "://[redacted]@"],
  [/Bearer\s+\S+/gi, "Bearer [redacted]"],
  [/password\s*[=:]\s*\S+/gi, "[redacted]"],
  [/api_?key\s*[=:]\s*\S+/gi, "[redacted]"],
  [/token\s*[=:]\s*\S+/gi, "[redacted]"],
  [/secret\s*[=:]\s*\S+/gi, "[redacted]"],
];

/**
 * Extracts a safe error message from an unknown error value.
 * Uses `.message` for Error instances (never `.toString()` which includes the stack).
 * Returns `"Unknown error"` for non-Error values.
 * Redacts credentials that may appear in error messages.
 * @param error - The caught error value
 * @returns A sanitized error message safe for logging or re-throwing
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown error";
  return CREDENTIAL_PATTERNS.reduce<string>(
    (msg, [pattern, replacement]) => msg.replace(pattern, replacement),
    raw,
  );
}
