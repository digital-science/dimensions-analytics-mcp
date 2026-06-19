/**
 * Factory for DimensionsClient (public API vs internal dsl-service).
 * @module dsl/create-client
 */

import type { DimensionsClientConfig } from "../client/config.js";
import { type HostedEnvConfig, hostedBootstrapUser } from "../client/deployment-config.js";
import { DimensionsClient } from "./client.js";

export interface BuildDimensionsClientConfigOptions {
  readonly mode: "local" | "hosted";
  readonly hosted?: HostedEnvConfig;
  readonly apiKey?: string;
  readonly userEmail?: string;
  readonly clientIp?: string;
  readonly baseUrl?: string;
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly rateLimitPerMinute?: number;
}

/**
 * Builds validated DimensionsClient configuration for local or hosted deployment.
 */
export function buildDimensionsClientConfig(
  options: BuildDimensionsClientConfigOptions,
): DimensionsClientConfig {
  if (options.mode === "hosted") {
    const hosted = options.hosted;
    if (!hosted) {
      throw new Error("Hosted deployment config is required");
    }
    if (!options.userEmail) {
      throw new Error("userEmail is required for hosted MCP sessions");
    }
    return {
      backend: "internal",
      internal: {
        service: hosted.internal,
        userEmail: options.userEmail,
        clientIp: options.clientIp,
      },
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
    };
  }

  if (!options.apiKey) {
    throw new Error("Dimensions API key required");
  }

  return {
    backend: "public",
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    maxRetries: options.maxRetries,
    retryDelay: options.retryDelay,
    rateLimitPerMinute: options.rateLimitPerMinute,
  };
}

export type CreateDimensionsClientOptions = BuildDimensionsClientConfigOptions;

/**
 * Creates a DimensionsClient backed by the public API or internal dsl-service.
 */
export function createDimensionsClient(options: CreateDimensionsClientOptions): DimensionsClient {
  return new DimensionsClient(buildDimensionsClientConfig(options));
}

/**
 * Bootstrap client for hosted schema warmup (`mcp@DSL_HOST` for usage tracking).
 */
export function createBootstrapDimensionsClient(hosted: HostedEnvConfig): DimensionsClient {
  return createDimensionsClient({
    mode: "hosted",
    hosted,
    userEmail: hostedBootstrapUser(hosted.internal.host),
  });
}
