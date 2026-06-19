/**
 * MCP client helpers for hosted Streamable HTTP transport.
 * @module test/integration/hosted-client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { hostedMcpEndpoint } from "./env.js";

export interface HostedMcpSession {
  readonly client: Client;
  readonly transport: StreamableHTTPClientTransport;
  readonly close: () => Promise<void>;
}

export interface ConnectHostedMcpClientOptions {
  /** Server base URL (with or without `/mcp` suffix). */
  readonly baseUrl: string;
  /** User API key sent as `Authorization: Bearer`. */
  readonly apiKey: string;
}

/**
 * Connects an MCP client to a hosted HTTP server via Streamable HTTP.
 */
export async function connectHostedMcpClient(
  options: ConnectHostedMcpClientOptions,
): Promise<HostedMcpSession> {
  const url = new URL(hostedMcpEndpoint(options.baseUrl));
  const client = new Client({ name: "hosted-integration", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    },
  });

  await client.connect(transport);

  return {
    client,
    transport,
    close: async () => {
      await transport.close();
    },
  };
}

/**
 * Performs a GET /health check against a hosted MCP server base URL.
 */
export async function checkHostedHealth(baseUrl: string): Promise<Response> {
  const root = baseUrl.replace(/\/mcp\/?$/, "").replace(/\/$/, "");
  return fetch(`${root}/health`);
}
