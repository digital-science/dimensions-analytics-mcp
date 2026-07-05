/**
 * dsl-service adapter for hosted deployment (POST /query).
 * Usage metadata is sent via X-Dimensions-* headers (see usage-headers.ts), not JSON body.
 * @module client/internal-dsl-client
 */

import type { InternalDslEnvConfig } from "./deployment-config.js";
import {
  AuthenticationError,
  DimensionsError,
  NetworkError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  sanitizeErrorMessage,
  TimeoutError,
} from "./errors.js";
import type { RateLimiter } from "./rate-limiter.js";
import { executeRequestWithRetry } from "./request-retry.js";
import type { DslResponse, QueryExecutorOptions } from "./types.js";
import { getMcpUsageSession } from "./usage-context.js";
import { buildMcpUsageHeaders, buildMcpUserAgent } from "./usage-headers.js";

export interface InternalDslClientOptions {
  readonly config: InternalDslEnvConfig;
  /** User email for X-DIMENSIONS-USER (required by dsl-service) */
  readonly userEmail: string;
  /**
   * End-user IP forwarded as X-Forwarded-For for dsl-service per-IP throttling.
   * Set from the inbound MCP HTTP request (see mcp/http-server.ts).
   */
  readonly clientIp?: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly rateLimiter?: RateLimiter;
}

/**
 * Executes DSL queries against dsl-service internal API.
 */
export class InternalDslClient {
  private readonly config: InternalDslEnvConfig;
  private readonly userEmail: string;
  private readonly clientIp?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly rateLimiter?: RateLimiter;

  constructor(options: InternalDslClientOptions) {
    this.config = options.config;
    this.userEmail = options.userEmail;
    this.clientIp = options.clientIp;
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.rateLimiter = options.rateLimiter;
  }

  /**
   * Runs a DSL query through dsl-service POST /query.
   */
  async query(dsl: string, options?: QueryExecutorOptions): Promise<DslResponse> {
    return executeRequestWithRetry(() => this.executeQuery(dsl, options), {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      rateLimiter: this.rateLimiter,
    });
  }

  private async executeQuery(dsl: string, options?: QueryExecutorOptions): Promise<DslResponse> {
    const url = `${this.config.serviceUrl.replace(/\/$/, "")}/query`;
    const controller = new AbortController();
    const timeoutMs = options?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const session = getMcpUsageSession();
    const usageHeaders = buildMcpUsageHeaders();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-DIMENSIONS-USER": this.userEmail,
      Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
      ...usageHeaders,
    };

    if (session) {
      headers["User-Agent"] = buildMcpUserAgent(session.version, session.client);
    }

    if (this.clientIp) {
      headers["X-Forwarded-For"] = this.clientIp;
    }

    const body = {
      query: dsl,
      dsl_schema: this.config.dslSchema,
      host: this.config.host,
      variant: this.config.variant,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal:
          options?.signal != null
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal,
      });

      if (!response.ok) {
        throw await this.mapError(response);
      }

      return (await response.json()) as DslResponse;
    } catch (error) {
      if (error instanceof DimensionsError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError("Request timeout");
      }
      throw new NetworkError(`Network error: ${sanitizeErrorMessage(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async mapError(response: Response): Promise<DimensionsError> {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string | unknown[] };
      if (typeof body.error === "string") {
        message = body.error;
      } else if (Array.isArray(body.error)) {
        message = JSON.stringify(body.error);
      }
    } catch {
      // ignore parse errors
    }

    switch (response.status) {
      case 401:
        return new AuthenticationError(message);
      case 400:
        return new QuerySyntaxError(message);
      case 429: {
        const retryAfterMs = this.rateLimiter?.getRetryDelayMs() ?? 2000;
        return new RateLimitError(
          "Rate limit exceeded — wait before retrying",
          Math.ceil(retryAfterMs / 1000),
          {
            remaining: this.rateLimiter?.getRemainingRequests() ?? 0,
            retryAfterMs,
          },
        );
      }
      default:
        if (response.status >= 500) {
          return new ServerError(message, response.status);
        }
        return new DimensionsError(message, response.status);
    }
  }
}
