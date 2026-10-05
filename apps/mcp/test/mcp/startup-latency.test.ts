/**
 * Local stdio startup must not wait on the Dimensions API (WEBAPPDEV-14080):
 * Claude Desktop gives up on `initialize` after ~10s, while auth + describe can take longer.
 * @module test/mcp/startup-latency
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSchemaCachePath } from "../../src/dsl/schema/index.js";
import { createMcpServerAsync } from "../../src/mcp/server.js";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/describe-schema.json", import.meta.url), "utf8"),
);

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

async function startApi(handler: Handler): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => handler(req, res, body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function fakeJwt(): string {
  const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ exp })}.signature`;
}

function sendJson(res: ServerResponse, value: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

describe("local stdio startup", () => {
  let tempDir: string;
  let api: Server | undefined;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dimensions-startup-"));
    process.env.SCHEMA_CACHE_PATH = join(tempDir, "nested", "schema.json");
    delete process.env.DEPLOYMENT_MODE;
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    if (api) {
      api.closeAllConnections();
      await new Promise<void>((resolve) => api?.close(() => resolve()));
      api = undefined;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("answers initialize and tools/list from the bundled snapshot while the API hangs", async () => {
    const started = await startApi(() => {
      // Never respond: simulates a slow auth/describe round trip.
    });
    api = started.server;

    const t0 = Date.now();
    const { server, schemaStore } = await createMcpServerAsync({
      apiKey: "test-key",
      baseUrl: started.baseUrl,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "startup-test", version: "1.0.0" });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const elapsed = Date.now() - t0;

    expect(schemaStore.loadSource).toBe("snapshot");
    expect(tools.some((tool) => tool.name === "search_publications")).toBe(true);
    expect(elapsed).toBeLessThan(2000);

    await client.close();
    await server.close();
  });

  it("serves a stale cache immediately and swaps in the refreshed schema", async () => {
    const cachePath = process.env.SCHEMA_CACHE_PATH as string;
    mkdirSync(join(tempDir, "nested"));
    writeFileSync(
      cachePath,
      JSON.stringify({ cachedAt: "2020-01-01T00:00:00.000Z", version: "1.0.0", schema: fixture }),
    );

    const started = await startApi((req, res, body) => {
      if (req.url === "/api/auth.json") return sendJson(res, { token: fakeJwt() });
      if (body === "describe version") return sendJson(res, { version: "9.9.9" });
      return sendJson(res, fixture);
    });
    api = started.server;

    const { client, schemaStore, schemaContext } = await createMcpServerAsync({
      apiKey: "test-key",
      baseUrl: started.baseUrl,
    });
    expect(schemaStore.loadSource).toBe("cache");
    expect(schemaStore.stale).toBe(true);

    await vi.waitFor(() => expect(schemaContext.store.loadSource).toBe("api"), {
      timeout: 5000,
    });
    expect(schemaContext.store.version).toBe("9.9.9");
    expect((client as unknown as { schemaStore: unknown }).schemaStore).toBe(schemaContext.store);
    const written = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(written.version).toBe("9.9.9");
  });

  it("uses a fresh cache without contacting the API", async () => {
    const cachePath = process.env.SCHEMA_CACHE_PATH as string;
    mkdirSync(join(tempDir, "nested"));
    writeFileSync(
      cachePath,
      JSON.stringify({ cachedAt: new Date().toISOString(), version: "2.15.0", schema: fixture }),
    );
    const requests: string[] = [];
    const started = await startApi((req, res) => {
      requests.push(req.url ?? "");
      res.end();
    });
    api = started.server;

    const { schemaStore } = await createMcpServerAsync({
      apiKey: "test-key",
      baseUrl: started.baseUrl,
    });
    expect(schemaStore.loadSource).toBe("cache");
    expect(schemaStore.stale).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual([]);
  });
});

describe("defaultSchemaCachePath", () => {
  it("keys the cache file by instance host", () => {
    const trial = defaultSchemaCachePath("https://trial.dimensions.ai");
    expect(trial).toMatch(/dimensions-analytics-mcp[/\\]schema-trial\.dimensions\.ai\.json$/);
    expect(defaultSchemaCachePath("https://app.dimensions.ai")).not.toBe(trial);
  });
});
