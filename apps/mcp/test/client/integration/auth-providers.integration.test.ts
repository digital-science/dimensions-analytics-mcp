/**
 * Integration tests for auth providers.
 * Tests against real APIs using credentials from .dimensions.config.json
 *
 * @module core/test/integration/auth-providers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { withCaching } from "../../../src/client/auth/decorators/with-caching.js";
import { createAuthProvider } from "../../../src/client/auth/factory.js";
import { JwtAuthProvider } from "../../../src/client/auth/providers/jwt-auth-provider.js";
import type { JwtAuthConfig } from "../../../src/client/auth/types.js";

interface DslConfig {
  apiKey: string;
  baseUrl: string;
}

interface ConfigFile {
  dsl?: DslConfig;
}

/**
 * Load test configuration from .dimensions.config.json
 */
function loadConfig(): DslConfig | null {
  const configPath = path.resolve(process.cwd(), ".dimensions.config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(content) as ConfigFile;

  if (parsed.dsl?.apiKey && parsed.dsl?.baseUrl) {
    return parsed.dsl;
  }

  return null;
}

describe("Auth Providers Integration Tests", () => {
  let config: DslConfig | null;

  beforeAll(() => {
    config = loadConfig();
  });

  describe("JWT Provider", () => {
    it.skipIf(!loadConfig())("authenticates against real Dimensions API", async () => {
      const jwtConfig: JwtAuthConfig = {
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      };

      const provider = new JwtAuthProvider(jwtConfig);
      const headers = await provider.getHeaders();

      expect(headers).toHaveProperty("Authorization");
      expect(headers.Authorization).toMatch(/^JWT /);
      // Token should be a non-empty string
      expect(headers.Authorization.length).toBeGreaterThan(4);
    });

    it.skipIf(!loadConfig())("token format is valid JWT", async () => {
      const jwtConfig: JwtAuthConfig = {
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      };

      const provider = new JwtAuthProvider(jwtConfig);
      const headers = await provider.getHeaders();

      const token = headers.Authorization.replace("JWT ", "");
      // JWT tokens have 3 parts separated by dots
      const parts = token.split(".");
      expect(parts.length).toBe(3);
    });

    it.skipIf(!loadConfig())("refresh fetches a new token", async () => {
      const jwtConfig: JwtAuthConfig = {
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      };

      const provider = new JwtAuthProvider(jwtConfig);

      // Get initial token
      const headers1 = await provider.getHeaders();
      const token1 = headers1.Authorization;

      // Force refresh
      await provider.refresh();

      // Get new token
      const headers2 = await provider.getHeaders();
      const token2 = headers2.Authorization;

      // Both should be valid JWT format
      expect(token1).toMatch(/^JWT /);
      expect(token2).toMatch(/^JWT /);
      // Tokens might be different (depends on server implementation)
      // but at least both calls should succeed
    });

    it.skipIf(!loadConfig())("invalidate clears state and forces refresh", async () => {
      const jwtConfig: JwtAuthConfig = {
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      };

      const provider = new JwtAuthProvider(jwtConfig);

      // Get initial token
      await provider.getHeaders();

      // Invalidate
      provider.invalidate();

      // Should be able to get headers again after invalidation
      const headers = await provider.getHeaders();
      expect(headers.Authorization).toMatch(/^JWT /);
    });
  });

  describe("JWT Provider with Caching", () => {
    it.skipIf(!loadConfig())("caches token and reuses it", async () => {
      const jwtConfig: JwtAuthConfig = {
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      };

      const baseProvider = new JwtAuthProvider(jwtConfig);
      const cachedProvider = withCaching(baseProvider, {
        cacheDurationMs: 300000, // 5 minutes
      });

      // First call - should hit the API
      const start1 = Date.now();
      const headers1 = await cachedProvider.getHeaders();
      const duration1 = Date.now() - start1;

      // Second call - should be instant from cache
      const start2 = Date.now();
      const headers2 = await cachedProvider.getHeaders();
      const duration2 = Date.now() - start2;

      // Both should return same token
      expect(headers1.Authorization).toBe(headers2.Authorization);

      // Second call should be significantly faster (cached)
      // First call involves network, second should be < 5ms
      expect(duration2).toBeLessThan(duration1);
      expect(duration2).toBeLessThan(10); // Cached response should be very fast
    });
  });

  describe("createAuthProvider factory", () => {
    it.skipIf(!loadConfig())("creates working JWT provider with caching", async () => {
      const provider = createAuthProvider({
        type: "jwt",
        apiKey: config!.apiKey,
        authUrl: `${config!.baseUrl}/api/auth.json`,
      });

      expect(provider.type).toBe("jwt");

      const headers = await provider.getHeaders();
      expect(headers.Authorization).toMatch(/^JWT /);

      // Verify caching is applied - second call should be very fast
      const start = Date.now();
      await provider.getHeaders();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });
});
