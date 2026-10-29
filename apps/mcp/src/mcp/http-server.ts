/**
 * Express HTTP server for hosted MCP (Streamable HTTP transport).
 * @module mcp/http-server
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { Request, Response } from "express";
import type { HostedEnvConfig } from "../client/deployment-config.js";
import { AuthenticationError } from "../client/errors.js";
import { parseBearerToken, resolveUserFromApiKey } from "../client/resolve-api-key-user.js";
import { createMcpServerAsync, warmHostedSchemaCache } from "./server.js";
import { mcpClientFromUserAgent } from "./usage-tracking.js";

/** Backoff for retrying the startup schema load while dsl-service is unreachable. */
export interface SchemaWarmupRetryOptions {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

const DEFAULT_SCHEMA_WARMUP_RETRY: SchemaWarmupRetryOptions = {
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
};

/** Seconds a client should wait before retrying while the schema is still loading. */
const NOT_READY_RETRY_AFTER_SECONDS = 5;

export interface HostedHttpServerOptions {
  readonly hosted: HostedEnvConfig;
  readonly port: number;
  readonly bindHost?: string;
  readonly schemaWarmupRetry?: SchemaWarmupRetryOptions;
}

export interface HostedHttpServerHandle {
  /** Resolves to the bound TCP port once the server is listening. */
  readonly ready: Promise<number>;
  /**
   * Resolves `true` once the describe schema is loaded and /mcp accepts requests,
   * or `false` when {@link close} stops the retries first.
   * Never rejects: failed loads are retried with backoff.
   */
  readonly schemaReady: Promise<boolean>;
  readonly close: () => Promise<void>;
}

function clientIpFromRequest(req: IncomingMessage): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim();
  }
  return req.socket.remoteAddress ?? undefined;
}

/**
 * Starts the hosted MCP HTTP server with Streamable HTTP at POST /mcp.
 */
export function startHostedHttpServer(options: HostedHttpServerOptions): HostedHttpServerHandle {
  const bindHost = options.bindHost ?? "0.0.0.0";
  const retry = options.schemaWarmupRetry ?? DEFAULT_SCHEMA_WARMUP_RETRY;
  const app = createMcpExpressApp({ host: bindHost });

  let schemaLoaded = false;
  let lastSchemaError: string | undefined;
  let closed = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let wakeRetry: (() => void) | undefined;

  // Not ready until the schema loads: dsl-service may still be starting next to us (WEBAPPDEV-14210).
  app.get("/health", (_req: Request, res: Response) => {
    if (schemaLoaded) {
      res.status(200).json({ status: "ok" });
      return;
    }
    res.status(503).json({
      status: "starting",
      reason: lastSchemaError
        ? `Schema not loaded yet: ${lastSchemaError}`
        : "Schema not loaded yet",
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    if (!schemaLoaded) {
      res
        .status(503)
        .set("Retry-After", String(NOT_READY_RETRY_AFTER_SECONDS))
        .json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `Server is starting (Dimensions schema not loaded yet). Retry in ${NOT_READY_RETRY_AFTER_SECONDS} seconds.`,
          },
          id: null,
        });
      return;
    }

    try {
      const apiKey = parseBearerToken(req.headers.authorization);
      const clientIp = clientIpFromRequest(req);

      const userEmail = await resolveUserFromApiKey({
        apiKey,
        authUrl: options.hosted.radarAuthUrl,
        clientIp,
      });

      const mcpSessionId = randomUUID();
      const mcpClient = mcpClientFromUserAgent(
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      );

      const { server } = await createMcpServerAsync({
        deploymentMode: "hosted",
        hosted: options.hosted,
        userEmail,
        clientIp,
        mcpSessionId,
        mcpClient,
      });

      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        if (!res.headersSent) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Unauthorized" },
            id: null,
          });
        }
        return;
      }

      console.error("MCP HTTP error:", error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  let httpServer: Server | undefined;

  const ready = new Promise<number>((resolve, reject) => {
    const server = app.listen(options.port, bindHost);
    httpServer = server;
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      const port = address != null && typeof address === "object" ? address.port : options.port;
      resolve(port);
    });
  });

  const schemaReady = (async () => {
    for (let attempt = 0; !closed; attempt++) {
      try {
        await warmHostedSchemaCache(options.hosted);
        schemaLoaded = true;
        lastSchemaError = undefined;
        return true;
      } catch (error) {
        lastSchemaError = error instanceof Error ? error.message : String(error);
        const delayMs = Math.min(retry.initialDelayMs * 2 ** attempt, retry.maxDelayMs);
        console.error(
          `[schema] startup load failed (attempt ${attempt + 1}): ${lastSchemaError}; retrying in ${delayMs}ms`,
        );
        await new Promise<void>((resolve) => {
          wakeRetry = resolve;
          retryTimer = setTimeout(resolve, delayMs);
        });
      }
    }
    return false;
  })();

  return {
    ready,
    schemaReady,
    close: async () => {
      closed = true;
      clearTimeout(retryTimer);
      wakeRetry?.();
      await new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
