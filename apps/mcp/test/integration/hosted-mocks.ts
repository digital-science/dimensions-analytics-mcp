/**
 * Mock fetch handlers for hosted MCP e2e tests (auth.json + dsl-service).
 * @module test/integration/hosted-mocks
 */

import describeFixture from "../fixtures/describe-schema.json";

export interface HostedServiceMocksOptions {
  readonly authUrl: string;
  readonly dslServiceUrl: string;
  /** API keys accepted by mock auth (default: any non-empty key). */
  readonly validApiKeys?: readonly string[];
  readonly userEmail?: string;
}

function jwtWithSub(sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function mockSearchPublicationsResponse(): Record<string, unknown> {
  return {
    publications: [{ id: "pub.test.1", title: "Mock CRISPR publication" }],
    _stats: { total_count: 42 },
  };
}

/**
 * Installs global fetch mocks for Radar auth and dsl-service.
 * @returns Function that restores the original fetch implementation
 */
export function installHostedServiceMocks(options: HostedServiceMocksOptions): () => void {
  const originalFetch = globalThis.fetch;
  const authBase = options.authUrl.replace(/\/$/, "");
  const dslBase = options.dslServiceUrl.replace(/\/$/, "");
  const userEmail = options.userEmail ?? "user@example.com";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveUrl(input);

    if (url.startsWith(`${authBase}/api/auth.json`) || url.endsWith("/api/auth.json")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const key = body.key as string | undefined;
      if (!key?.trim()) {
        return Response.json({ error: "Invalid or revoked API key." }, { status: 401 });
      }
      if (options.validApiKeys && !options.validApiKeys.includes(key)) {
        return Response.json({ error: "Invalid or revoked API key." }, { status: 401 });
      }
      return Response.json({ token: jwtWithSub(userEmail) });
    }

    if (url.startsWith(`${dslBase}/query`)) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const query = String(body.query ?? "");
      if (query.includes("describe schema")) {
        return Response.json(describeFixture);
      }
      if (query.includes("describe version")) {
        return Response.json({ version: "2.15.0" });
      }
      if (query.includes("search publications")) {
        return Response.json(mockSearchPublicationsResponse());
      }
      return Response.json({ error: `Unhandled mock query: ${query}` }, { status: 400 });
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
