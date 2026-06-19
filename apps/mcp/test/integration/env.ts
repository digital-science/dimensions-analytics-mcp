/**
 * Environment variable helpers for live integration and hosted e2e tests.
 * @module test/integration/env
 */

import type { HostedEnvConfig } from "../../src/client/deployment-config.js";
import { loadDeploymentConfig } from "../../src/client/deployment-config.js";

/** Env vars required for local (stdio) MCP integration smoke tests. */
export const LOCAL_INTEGRATION_ENV_VARS = ["DIMENSIONS_API_KEY"] as const;

/** Env vars required for hosted MCP integration smoke tests (live backends). */
export const HOSTED_INTEGRATION_ENV_VARS = [
  "DIMENSIONS_API_KEY",
  "DSL_SERVICE_URL",
  "DSL_SERVICE_USERNAME",
  "DSL_SERVICE_PASSWORD",
  "DSL_SCHEMA",
  "DSL_HOST",
  "DSL_VARIANT",
  "RADAR_AUTH_URL",
] as const;

/** Optional env vars for hosted integration. */
export const HOSTED_INTEGRATION_OPTIONAL_ENV_VARS = [
  "HOSTED_MCP_BASE_URL",
  "SCHEMA_CACHE_PATH",
  "MCP_HTTP_PORT",
] as const;

export type LocalIntegrationEnvVar = (typeof LOCAL_INTEGRATION_ENV_VARS)[number];
export type HostedIntegrationEnvVar = (typeof HOSTED_INTEGRATION_ENV_VARS)[number];

export interface LocalIntegrationConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export interface HostedIntegrationConfig {
  readonly apiKey: string;
  readonly hosted: HostedEnvConfig;
  /** When set, tests hit this base URL instead of starting an in-process HTTP server. */
  readonly remoteBaseUrl?: string;
}

/**
 * Returns env var names from `required` that are unset or empty.
 */
export function missingEnvVars(required: readonly string[]): string[] {
  return required.filter((name) => !process.env[name]?.trim());
}

/**
 * Returns true when local integration smoke can run.
 */
export function isLocalIntegrationConfigured(): boolean {
  return missingEnvVars(LOCAL_INTEGRATION_ENV_VARS).length === 0;
}

/**
 * Returns true when hosted integration smoke can run against live backends.
 */
export function isHostedIntegrationConfigured(): boolean {
  return missingEnvVars(HOSTED_INTEGRATION_ENV_VARS).length === 0;
}

/**
 * Loads local integration config from environment, or undefined when credentials are missing.
 */
export function loadLocalIntegrationConfig(): LocalIntegrationConfig | undefined {
  if (!isLocalIntegrationConfigured()) {
    return undefined;
  }
  return {
    apiKey: process.env.DIMENSIONS_API_KEY!,
    baseUrl: process.env.DIMENSIONS_BASE_URL,
  };
}

/**
 * Loads hosted integration config from environment, or undefined when credentials are missing.
 * Sets `DEPLOYMENT_MODE=hosted` when loading deployment config.
 */
export function loadHostedIntegrationConfig(): HostedIntegrationConfig | undefined {
  if (!isHostedIntegrationConfigured()) {
    return undefined;
  }

  process.env.DEPLOYMENT_MODE = "hosted";
  const deployment = loadDeploymentConfig();
  if (deployment.deploymentMode !== "hosted") {
    return undefined;
  }

  return {
    apiKey: process.env.DIMENSIONS_API_KEY!,
    hosted: deployment,
    remoteBaseUrl: process.env.HOSTED_MCP_BASE_URL?.replace(/\/$/, ""),
  };
}

/**
 * Builds the MCP `/mcp` endpoint URL for hosted integration.
 */
export function hostedMcpEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/mcp") ? trimmed : `${trimmed}/mcp`;
}
