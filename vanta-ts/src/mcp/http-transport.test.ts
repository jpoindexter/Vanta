import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpClient } from "./client.js";
import { httpTransport, resolveToken } from "./http-transport.js";

// A tiny loopback HTTP MCP endpoint: echoes the request id, requires a Bearer
// token, and replies with a SINGLE JSON object that has NO trailing newline —
// the shape that previously stalled the newline-framed McpClient.
function jsonRpcServer(): { server: Server; url: () => string; lastAuth: () => string | undefined } {
  let lastAuth: string | undefined;
  const server = createServer((req, res) => {
    lastAuth = req.headers["authorization"] as string | undefined;
    if ((req.headers["authorization"] ?? "") !== "Bearer good") {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("Unauthorized");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const msg = JSON.parse(body) as { id?: number; method: string };
      const result = msg.method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: {} } : { content: [{ type: "text", text: "pong" }] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(msg.id === undefined ? "" : JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })); // no trailing \n
    });
  });
  return { server, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`, lastAuth: () => lastAuth };
}

describe("resolveToken", () => {
  it("prefers an explicit token, else the per-server env var", () => {
    expect(resolveToken("foo", "explicit", {} as NodeJS.ProcessEnv)).toBe("explicit");
    expect(resolveToken("my-server", undefined, { VANTA_MCP_TOKEN_MY_SERVER: "envtok" } as NodeJS.ProcessEnv)).toBe("envtok");
    expect(resolveToken("none", undefined, {} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

describe("httpTransport + McpClient", () => {
  let s: ReturnType<typeof jsonRpcServer>;
  beforeEach(async () => {
    s = jsonRpcServer();
    await new Promise<void>((r) => s.server.listen(0, "127.0.0.1", r));
  });
  afterEach(async () => {
    await new Promise<void>((r) => s.server.close(() => r()));
  });

  it("initializes + calls a tool over HTTP when a non-newline-terminated body comes back", async () => {
    const client = new McpClient(httpTransport(s.url(), { token: "good" }), {});
    await client.initialize();
    expect(await client.callTool("ping", {})).toBe("pong");
    expect(s.lastAuth()).toBe("Bearer good");
  });

  it("surfaces an HTTP 401 as a transport error (the auth-required signal)", async () => {
    const client = new McpClient(httpTransport(s.url(), { token: "wrong" }), {});
    await expect(client.initialize()).rejects.toThrow(/HTTP 401/);
  });
});
