/**
 * dsl-service adapter for hosted deployment (POST /query, JSON body).
 * @module client/internal-dsl-client
 */

import { buildHostedDslLoggingInfo, type InternalDslEnvConfig } from "./deployment-config.js";
import {
  AuthenticationError,
  DimensionsError,
  NetworkError,
  QuerySyntaxError,
  ServerError,
  sanitizeErrorMessage,
  TimeoutError,
} from "./errors.js";
import type { DslResponse, QueryExecutorOptions } from "./types.js";

export interface InternalDslClientOptions {
  readonly config: InternalDslEnvConfig;
  /** User email for X-DIMENSIONS-USER (required by dsl-service) */
  readonly userEmail: string;
  /** Optional client IP to forward */
  readonly clientIp?: string;
  readonly timeout?: number;
}

/**
 * Executes DSL queries against dsl-service internal API.
 */
export class InternalDslClient {
  private readonly config: InternalDslEnvConfig;
  private readonly userEmail: string;
  private readonly clientIp?: string;
  private readonly timeout: number;

  constructor(options: InternalDslClientOptions) {
    this.config = options.config;
    this.userEmail = options.userEmail;
    this.clientIp = options.clientIp;
    this.timeout = options.timeout ?? 30_000;
  }

  /**
   * Runs a DSL query through dsl-service POST /query.
   */
  async query(dsl: string, options?: QueryExecutorOptions): Promise<DslResponse> {
    const url = `${this.config.serviceUrl.replace(/\/$/, "")}/query`;
    const controller = new AbortController();
    const timeoutMs = options?.timeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-DIMENSIONS-USER": this.userEmail,
      Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
    };

    if (this.clientIp) {
      headers["X-Forwarded-For"] = this.clientIp;
    }

    const body = {
      query: dsl,
      dsl_schema: this.config.dslSchema,
      host: this.config.host,
      variant: this.config.variant,
      additional_logging_info: buildHostedDslLoggingInfo(this.userEmail, this.config.variant),
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
      default:
        if (response.status >= 500) {
          return new ServerError(message, response.status);
        }
        return new DimensionsError(message, response.status);
    }
  }
}
