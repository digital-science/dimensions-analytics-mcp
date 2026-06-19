/**
 * Express HTTP server for hosted MCP (Streamable HTTP transport).
 * @module mcp/http-server
 */

import type { IncomingMessage, Server } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { HostedEnvConfig } from "../client/deployment-config.js";
import { AuthenticationError } from "../client/errors.js";
import { parseBearerToken, resolveUserFromApiKey } from "../client/resolve-api-key-user.js";
import { createMcpServerAsync, warmHostedSchemaCache } from "./server.js";

export interface HostedHttpServerOptions {
  readonly hosted: HostedEnvConfig;
  readonly port: number;
  readonly bindHost?: string;
}

export interface HostedHttpServerHandle {
  /** Resolves to the bound TCP port once the server is listening. */
  readonly ready: Promise<number>;
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
  const app = createMcpExpressApp({ host: bindHost });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const apiKey = parseBearerToken(req.headers.authorization);
      const clientIp = clientIpFromRequest(req);

      const userEmail = await resolveUserFromApiKey({
        apiKey,
        authUrl: options.hosted.radarAuthUrl,
        clientIp,
      });

      const { server } = await createMcpServerAsync({
        deploymentMode: "hosted",
        hosted: options.hosted,
        userEmail,
        clientIp,
      });

      const transport = new StreamableHTTPServerTransport({
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

  const ready = warmHostedSchemaCache(options.hosted).then(
    () =>
      new Promise<number>((resolve, reject) => {
        const server = app.listen(options.port, bindHost);
        httpServer = server;
        server.once("error", reject);
        server.once("listening", () => {
          const address = server.address();
          const port = address != null && typeof address === "object" ? address.port : options.port;
          resolve(port);
        });
      }),
  );

  return {
    ready,
    close: async () => {
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
