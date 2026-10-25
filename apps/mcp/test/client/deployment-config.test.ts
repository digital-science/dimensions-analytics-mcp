/**
 * Tests for deployment configuration loading.
 * @module test/client/deployment-config
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostedBootstrapUser, loadDeploymentConfig } from "../../src/client/deployment-config.js";

const HOSTED_ENV = {
  DEPLOYMENT_MODE: "hosted",
  DSL_SERVICE_URL: "https://dsl.example.com",
  DSL_SERVICE_USERNAME: "svc-user",
  DSL_SERVICE_PASSWORD: "svc-pass",
  DSL_SCHEMA: "external",
  DSL_HOST: "app.example.com",
  DSL_VARIANT: "standard",
  RADAR_AUTH_URL: "https://app.example.com",
  MCP_HTTP_PORT: "9090",
} as const;

describe("loadDeploymentConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(HOSTED_ENV)) {
      delete process.env[key];
    }
    delete process.env.DEPLOYMENT_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to local mode", () => {
    expect(loadDeploymentConfig()).toEqual({ deploymentMode: "local" });
  });

  it("loads hosted configuration from environment", () => {
    Object.assign(process.env, HOSTED_ENV);

    expect(loadDeploymentConfig()).toEqual({
      deploymentMode: "hosted",
      radarAuthUrl: "https://app.example.com",
      internal: {
        serviceUrl: "https://dsl.example.com",
        username: "svc-user",
        password: "svc-pass",
        dslSchema: "external",
        host: "app.example.com",
        variant: "standard",
      },
      httpPort: 9090,
    });
  });

  it("strips a trailing slash from RADAR_AUTH_URL", () => {
    Object.assign(process.env, HOSTED_ENV, {
      RADAR_AUTH_URL: "https://app.example.com/",
    });

    expect(loadDeploymentConfig()).toMatchObject({
      deploymentMode: "hosted",
      radarAuthUrl: "https://app.example.com",
    });
  });

  it("treats service credentials as optional", () => {
    Object.assign(process.env, HOSTED_ENV);
    delete process.env.DSL_SERVICE_USERNAME;
    delete process.env.DSL_SERVICE_PASSWORD;

    const config = loadDeploymentConfig();
    expect(config).toMatchObject({ deploymentMode: "hosted" });
    if (config.deploymentMode !== "hosted") throw new Error("expected hosted");
    expect(config.internal.username).toBeUndefined();
    expect(config.internal.password).toBeUndefined();
  });

  it("rejects a username without a password", () => {
    Object.assign(process.env, HOSTED_ENV);
    delete process.env.DSL_SERVICE_PASSWORD;

    expect(() => loadDeploymentConfig()).toThrow("must be set together");
  });

  it("throws when hosted mode is missing required variables", () => {
    process.env.DEPLOYMENT_MODE = "hosted";
    process.env.DSL_SERVICE_URL = "https://dsl.example.com";

    expect(() => loadDeploymentConfig()).toThrow("Hosted deployment requires:");
  });
});

describe("hostedBootstrapUser", () => {
  it("derives mcp@host from DSL_HOST", () => {
    expect(hostedBootstrapUser("app.dimensions.ai")).toBe("mcp@app.dimensions.ai");
  });
});
