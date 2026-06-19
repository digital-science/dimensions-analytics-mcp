/**
 * HTTP client for Dimensions API requests.
 * Handles retry logic, timeout, and error mapping.
 * @module core/http-client
 */

import type { AuthProvider } from "./auth/types.js";
import {
  AuthenticationError,
  DimensionsError,
  NetworkError,
  NotFoundError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  sanitizeErrorMessage,
  TimeoutError,
  UnprocessableEntityError,
} from "./errors.js";
import type { RateLimiter } from "./rate-limiter.js";

/**
 * Configuration options for the HTTP client.
 */
export interface HttpClientConfig {
  /** Base URL for API requests */
  readonly baseUrl: string;
  /** Authentication provider for generating request headers */
  readonly authProvider: AuthProvider;
  /** Request timeout in milliseconds (default: 30000) */
  readonly timeout?: number;
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  readonly retryDelay?: number;
  /** Optional rate limiter for client-side request throttling */
  readonly rateLimiter?: RateLimiter;
}

/**
 * Base options for all request types.
 */
export interface RequestOptions {
  /** Additional headers to include */
  readonly headers?: Record<string, string>;
  /** Request timeout override */
  readonly timeout?: number;
  /** AbortSignal for cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Options for GET requests.
 */
export interface GetOptions extends RequestOptions {
  /** Query parameters to append to URL */
  readonly params?: Record<string, string | number | boolean | string[] | number[]>;
}

/**
 * Options for POST requests with JSON body.
 */
export interface PostJsonOptions extends RequestOptions {
  /** JSON body (will be serialized) */
  readonly json: unknown;
}

/**
 * Options for POST requests with form-urlencoded body.
 */
export interface PostFormOptions extends RequestOptions {
  /** Form data (will be URL-encoded) */
  readonly form: Record<string, string>;
}

/**
 * Generic response structure from Dimensions API.
 */
export interface DimensionsResponse {
  /** Statistics about the query result */
  _stats?: {
    total_count: number;
  };
  /** Additional response fields (dynamic based on query) */
  [key: string]: unknown;
}

/**
 * HTTP client for making requests to the Dimensions API.
 * Implements retry logic with client-side throttling and exponential backoff for transient errors.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly authProvider: AuthProvider;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly rateLimiter: RateLimiter | undefined;

  /**
   * Creates a new HttpClient instance.
   * @param config - HTTP client configuration
   */
  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.authProvider = config.authProvider;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.rateLimiter = config.rateLimiter;
  }

  /**
   * Executes a DSL query against the Dimensions API.
   * @param dsl - The DSL query string
   * @param endpoint - API endpoint (default: /api/dsl/v2)
   * @param options - Optional request overrides (timeout, signal)
   * @returns The API response
   * @throws {QuerySyntaxError} If the query syntax is invalid
   * @throws {RateLimitError} If rate limit is exceeded after retries
   * @throws {ServerError} If server error persists after retries
   * @throws {NetworkError} If network error occurs after retries
   * @throws {TimeoutError} If request times out
   * @throws {AuthenticationError} If authentication fails
   */
  async query(
    dsl: string,
    endpoint: string = "/api/dsl/v2",
    options?: RequestOptions,
  ): Promise<DimensionsResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    return this.executeWithRetry<DimensionsResponse>(() =>
      this.executeDslRequest(url, dsl, options),
    );
  }

  /**
   * Executes a single DSL request with raw body.
   * @param url - Full request URL
   * @param dsl - DSL query string (sent as raw body)
   * @returns Parsed response
   */
  private async executeDslRequest(
    url: string,
    dsl: string,
    options?: RequestOptions,
  ): Promise<DimensionsResponse> {
    return this.wrapFetch<DimensionsResponse>({
      url,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: dsl,
      timeoutMs: options?.timeout ?? this.timeout,
      signal: options?.signal,
    });
  }

  /**
   * Maps HTTP response status to appropriate error type.
   * @param response - HTTP response
   * @returns Appropriate error instance
   */
  private async mapHttpError(response: Response): Promise<DimensionsError> {
    const status = response.status;

    switch (status) {
      case 400: {
        let message = "Query syntax error";
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          if (body.error?.message) {
            message = body.error.message;
          }
        } catch {
          // Ignore JSON parse errors
        }
        return new QuerySyntaxError(message);
      }

      case 401:
        return new AuthenticationError("Authentication failed");

      case 403:
        return new DimensionsError("Access denied", 403);

      case 404: {
        let message = "Resource not found";
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
            detail?: string;
          };
          if (body.error?.message) {
            message = body.error.message;
          } else if (body.detail) {
            message = body.detail;
          }
        } catch {
          // Ignore JSON parse errors
        }
        return new NotFoundError(message);
      }

      case 422: {
        let message = "Unprocessable entity";
        let details: Record<string, unknown> | undefined;
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
            detail?: string | Record<string, unknown>;
          };
          if (body.error?.message) {
            message = body.error.message;
          } else if (typeof body.detail === "string") {
            message = body.detail;
          } else if (body.detail) {
            details = body.detail;
          }
        } catch {
          // Ignore JSON parse errors
        }
        return new UnprocessableEntityError(message, details);
      }

      case 429: {
        const retryAfterMs = this.rateLimiter?.getRetryDelayMs() ?? 2000;
        const clientRateLimit = {
          remaining: this.rateLimiter?.getRemainingRequests() ?? 0,
          retryAfterMs,
        };
        return new RateLimitError(
          "Rate limit exceeded — wait before retrying",
          Math.ceil(retryAfterMs / 1000),
          clientRateLimit,
        );
      }

      default:
        if (status >= 500) {
          return new ServerError(`Server error: ${response.statusText}`, status);
        }
        return new DimensionsError(`HTTP error: ${status} ${response.statusText}`, status);
    }
  }

  /**
   * Executes a fetch request with timeout management and unified error mapping.
   * @param options - Request configuration
   * @returns Parsed JSON response
   * @throws {TimeoutError} If the request times out or the external signal fires
   * @throws {NetworkError} If a network-level error occurs
   * @throws {DimensionsError} If the HTTP response indicates an error
   */
  private async wrapFetch<T>(options: {
    readonly url: string;
    readonly method: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const authHeaders = await this.authProvider.getHeaders();

      const response = await fetch(options.url, {
        method: options.method,
        headers: { ...authHeaders, ...options.headers },
        body: options.body,
        signal:
          options.signal != null
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal,
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DimensionsError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TimeoutError("Request timeout");
        }
        throw new NetworkError(`Network error: ${sanitizeErrorMessage(error)}`);
      }

      throw new NetworkError("Unknown network error");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Determines if an error is retryable.
   * @param error - Error to check
   * @returns True if the error should be retried
   */
  private isRetryable(error: unknown): boolean {
    // Retry rate limit errors
    if (error instanceof RateLimitError) {
      return true;
    }

    // Retry server errors (5xx)
    if (error instanceof ServerError) {
      return true;
    }

    // Retry network errors
    if (error instanceof NetworkError) {
      return true;
    }

    // Retry timeout errors
    if (error instanceof TimeoutError) {
      return true;
    }

    // Don't retry other errors (400, 401, 403, etc.)
    return false;
  }

  /**
   * Delays execution for the specified time.
   * @param ms - Delay in milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sends a GET request with optional query parameters.
   * @param path - URL path (appended to baseUrl)
   * @param options - Request options including params
   * @returns Parsed JSON response
   */
  async get<T = unknown>(path: string, options?: GetOptions): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    return this.executeWithRetry<T>(() => this.executeGetRequest(url, options));
  }

  /**
   * Builds URL with query parameters.
   * @param path - URL path
   * @param params - Query parameters
   * @returns Full URL with query string
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | string[] | number[]>,
  ): string {
    const url = `${this.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          searchParams.append(key, String(item));
        }
      } else {
        searchParams.append(key, String(value));
      }
    }

    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Executes a single GET request.
   * @param url - Full request URL
   * @param options - Request options
   * @returns Parsed response
   */
  private async executeGetRequest<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.wrapFetch<T>({
      url,
      method: "GET",
      headers: options?.headers,
      timeoutMs: options?.timeout ?? this.timeout,
      signal: options?.signal,
    });
  }

  /**
   * Calculates the delay before the next retry attempt.
   * For rate-limit errors, uses the client rate limiter's slot timing.
   * For other transient errors, uses exponential backoff with jitter.
   * The result is capped at 60 seconds.
   * @param error - The error that triggered the retry
   * @param attempt - The current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(error: unknown, attempt: number): number {
    const MAX_DELAY = 60_000;

    if (error instanceof RateLimitError) {
      const delay =
        error.clientRateLimit?.retryAfterMs ??
        this.rateLimiter?.getRetryDelayMs() ??
        2000 * 2 ** attempt;
      return Math.min(delay, MAX_DELAY);
    }

    const backoff = this.retryDelay * 2 ** attempt * (0.5 + Math.random() * 0.5);
    return Math.min(backoff, MAX_DELAY);
  }

  /**
   * Executes a request with retry logic.
   * Uses client-side throttling before each attempt and exponential backoff for transient errors.
   * @param requestFn - Function that executes the request
   * @returns Response from successful request
   */
  private async executeWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.rateLimiter?.waitIfNeeded();
      try {
        const result = await requestFn();
        this.rateLimiter?.recordRequest();
        return result;
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt >= this.maxRetries) {
          throw error;
        }

        const retryDelay = this.calculateRetryDelay(error, attempt);
        await this.delay(retryDelay);
      }
    }

    throw lastError ?? new NetworkError("Unknown error occurred");
  }

  /**
   * Sends a POST request with JSON body.
   * @param path - URL path (appended to baseUrl)
   * @param options - Request options with JSON body
   * @returns Parsed JSON response
   */
  async postJson<T = unknown>(path: string, options: PostJsonOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.executeWithRetry<T>(() => this.executePostJsonRequest(url, options));
  }

  /**
   * Executes a single POST JSON request.
   * @param url - Full request URL
   * @param options - Request options with JSON body
   * @returns Parsed response
   */
  private async executePostJsonRequest<T>(url: string, options: PostJsonOptions): Promise<T> {
    return this.wrapFetch<T>({
      url,
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(options.json),
      timeoutMs: options.timeout ?? this.timeout,
      signal: options.signal,
    });
  }

  /**
   * Sends a POST request with JSON body and returns the raw `Response`.
   * The caller owns the response body and must consume or close it.
   * Auth, timeout, retry, and error-status handling are applied identically
   * to {@link postJson}, but the body is **not** read or parsed.
   * @param path - URL path (appended to baseUrl)
   * @param options - Request options with JSON body
   * @returns The raw fetch Response (body unconsumed)
   */
  async postJsonRaw(path: string, options: PostJsonOptions): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    return this.executeWithRetry<Response>(() => this.executePostJsonRawRequest(url, options));
  }

  /**
   * Executes a single POST JSON request and returns the raw Response.
   * @param url - Full request URL
   * @param options - Request options with JSON body
   * @returns Raw Response with unconsumed body
   */
  private async executePostJsonRawRequest(
    url: string,
    options: PostJsonOptions,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = options.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const authHeaders = await this.authProvider.getHeaders();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders, ...options.headers },
        body: JSON.stringify(options.json),
        signal:
          options.signal != null
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal,
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      // Clear timeout only for the request phase — the caller is responsible
      // for consuming the body within a reasonable timeframe.
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DimensionsError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TimeoutError("Request timeout");
        }
        throw new NetworkError(`Network error: ${sanitizeErrorMessage(error)}`);
      }

      throw new NetworkError("Unknown network error");
    }
  }

  /**
   * Sends a POST request with form-urlencoded body.
   * @param path - URL path (appended to baseUrl)
   * @param options - Request options with form data
   * @returns Parsed JSON response
   */
  async postForm<T = unknown>(path: string, options: PostFormOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.executeWithRetry<T>(() => this.executePostFormRequest(url, options));
  }

  /**
   * Executes a single POST form-urlencoded request.
   * @param url - Full request URL
   * @param options - Request options with form data
   * @returns Parsed response
   */
  private async executePostFormRequest<T>(url: string, options: PostFormOptions): Promise<T> {
    return this.wrapFetch<T>({
      url,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...options.headers },
      body: new URLSearchParams(options.form).toString(),
      timeoutMs: options.timeout ?? this.timeout,
      signal: options.signal,
    });
  }
}
