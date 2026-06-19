/**
 * Deployment mode and hosted backend configuration from environment.
 * @module client/deployment-config
 */

import { z } from "zod";

export type DeploymentMode = "local" | "hosted";

export const InternalDslEnvSchema = z.object({
  serviceUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  dslSchema: z.string().min(1),
  host: z.string().min(1),
  variant: z.string().min(1),
});

export type InternalDslEnvConfig = z.infer<typeof InternalDslEnvSchema>;

export interface HostedEnvConfig {
  readonly deploymentMode: "hosted";
  readonly radarAuthUrl: string;
  readonly internal: InternalDslEnvConfig;
  readonly httpPort: number;
}

export interface LocalEnvConfig {
  readonly deploymentMode: "local";
}

export type AppDeploymentConfig = HostedEnvConfig | LocalEnvConfig;

function readDeploymentMode(): DeploymentMode {
  const raw = process.env.DEPLOYMENT_MODE?.trim().toLowerCase();
  return raw === "hosted" ? "hosted" : "local";
}

function readIntEnv(raw: string | undefined, fallback: number, min: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

/**
 * Synthetic identity for hosted schema warmup (`describe schema` at startup).
 * Passed as `X-DIMENSIONS-USER` for dsl-service usage tracking only — not a
 * provisioned Dimensions account.
 */
export function hostedBootstrapUser(host: string): string {
  return `mcp@${host}`;
}

/**
 * MCP-prefixed user label for dsl usage logs (reversible plus-addressing).
 */
export function mcpTrackingUser(dimensionsUser: string): string {
  const at = dimensionsUser.indexOf("@");
  if (at <= 0) return `mcp+${dimensionsUser}`;
  return `mcp+${dimensionsUser.slice(0, at)}${dimensionsUser.slice(at)}`;
}

export interface HostedDslLoggingInfo {
  user: string;
  dimensions_user: string;
  channel: "mcp";
  mcp_user: string;
  product_variant: string;
  source: "dimensions-analytics-mcp-hosted";
}

/**
 * `additional_logging_info` for hosted dsl-service queries.
 * `X-DIMENSIONS-USER` stays the canonical Dimensions user; channel fields tag MCP traffic.
 */
export function buildHostedDslLoggingInfo(
  dimensionsUser: string,
  variant: string,
): HostedDslLoggingInfo {
  return {
    user: dimensionsUser,
    dimensions_user: dimensionsUser,
    channel: "mcp",
    mcp_user: mcpTrackingUser(dimensionsUser),
    product_variant: variant,
    source: "dimensions-analytics-mcp-hosted",
  };
}

/**
 * Loads deployment configuration from environment variables.
 * @throws {Error} When hosted mode is enabled but required vars are missing
 */
export function loadDeploymentConfig(): AppDeploymentConfig {
  if (readDeploymentMode() !== "hosted") {
    return { deploymentMode: "local" };
  }

  const serviceUrl = process.env.DSL_SERVICE_URL;
  const username = process.env.DSL_SERVICE_USERNAME;
  const password = process.env.DSL_SERVICE_PASSWORD;
  const dslSchema = process.env.DSL_SCHEMA;
  const host = process.env.DSL_HOST;
  const variant = process.env.DSL_VARIANT;
  const radarAuthUrl = process.env.RADAR_AUTH_URL;

  const missing: string[] = [];
  if (!serviceUrl) missing.push("DSL_SERVICE_URL");
  if (!username) missing.push("DSL_SERVICE_USERNAME");
  if (!password) missing.push("DSL_SERVICE_PASSWORD");
  if (!dslSchema) missing.push("DSL_SCHEMA");
  if (!host) missing.push("DSL_HOST");
  if (!variant) missing.push("DSL_VARIANT");
  if (!radarAuthUrl) missing.push("RADAR_AUTH_URL");

  if (missing.length > 0) {
    throw new Error(`Hosted deployment requires: ${missing.join(", ")}`);
  }

  const internal = InternalDslEnvSchema.parse({
    serviceUrl,
    username,
    password,
    dslSchema,
    host,
    variant,
  });

  return {
    deploymentMode: "hosted",
    radarAuthUrl: radarAuthUrl!.replace(/\/$/, ""),
    internal,
    httpPort: readIntEnv(process.env.MCP_HTTP_PORT, 8080, 1),
  };
}
