import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMcpAuthTool } from "./mcp-auth.js";
import { InMemoryToolRegistry } from "./registry.js";
import { mountMcpServers } from "../mcp/mount.js";
import { AuthPendingRegistry } from "../mcp/auth-pending.js";
import { saveMcpToken } from "../mcp/auth-store.js";
import type { ToolContext } from "./types.js";

// A loopback HTTP server standing in for an MCP-over-HTTP server that requires
// OAuth. Without a Bearer token it returns 401 (the auth-required signal);
// with one it answers JSON-RPC initialize / tools/list. It also doubles as the
// OAuth token endpoint. No external MCP binary — fully self-contained "mocked HTTP".
function fakeMcpServer(): { server: Server; url: () => string } {
  const server = createServer((req, res) => {
    if (req.url === "/token") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "granted-token", token_type: "Bearer" }));
      return;
    }
    const authed = (req.headers["authorization"] ?? "") === "Bearer granted-token";
    if (!authed) {
      res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" });
      res.end("Unauthorized");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const msg = JSON.parse(body) as { id?: number; method: string };
      const reply =
        msg.method === "initialize"
          ? { protocolVersion: "2024-11-05", capabilities: {} }
          : msg.method === "tools/list"
            ? { tools: [{ name: "ping", description: "p", inputSchema: { type: "object" } }] }
            : {};
      res.writeHead(200, { "content-type": "application/json" });
      // The McpClient frames messages on newlines — terminate each reply with \n.
      res.end(msg.id === undefined ? "" : `${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: reply })}\n`);
    });
  });
  return { server, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let home: string;
let mcp: ReturnType<typeof fakeMcpServer>;

function ctx(): ToolContext {
  return { root: process.cwd(), safety: {} as ToolContext["safety"], requestApproval: async () => true };
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-mcpauth-tool-"));
  process.env.VANTA_HOME = home;
  mcp = fakeMcpServer();
  await new Promise<void>((r) => mcp.server.listen(0, "127.0.0.1", r));
});

afterEach(async () => {
  delete process.env.VANTA_HOME;
  delete process.env.VANTA_MCP_SERVERS;
  await new Promise<void>((r) => mcp.server.close(() => r()));
  await rm(home, { recursive: true, force: true });
});

function serverConfig() {
  return JSON.stringify({
    servers: {
      remote: {
        url: mcp.url(),
        authorizationUrl: `${mcp.url()}/authorize`,
        tokenUrl: `${mcp.url()}/token`,
        clientId: "cid",
      },
    },
  });
}

describe("mcp_auth — full flow with a mocked HTTP MCP server", () => {
  it("mount marks an auth-required server pending and does NOT register its tools", async () => {
    process.env.VANTA_MCP_SERVERS = serverConfig();
    const registry = new InMemoryToolRegistry();
    const pending = new AuthPendingRegistry();
    await mountMcpServers(registry, process.env, () => {}, { cwd: home, pending });
    expect(pending.has("remote")).toBe(true);
    expect(registry.schemas().some((s) => s.name === "mcp_remote_ping")).toBe(false);
  });

  it("mcp_auth returns an authorization URL for a pending server", async () => {
    process.env.VANTA_MCP_SERVERS = serverConfig();
    const registry = new InMemoryToolRegistry();
    const pending = new AuthPendingRegistry();
    await mountMcpServers(registry, process.env, () => {}, { cwd: home, pending });

    const tool = buildMcpAuthTool(registry, pending);
    const res = await tool.execute({ server: "remote" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("/authorize");
    expect(res.output).toContain("response_type=code");
  });

  it("reports a server that is not awaiting authorization", async () => {
    const tool = buildMcpAuthTool(new InMemoryToolRegistry(), new AuthPendingRegistry());
    const res = await tool.execute({ server: "ghost" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("not awaiting authorization");
  });

  it("after a token exists, reconnects the server and registers its real tools", async () => {
    process.env.VANTA_MCP_SERVERS = serverConfig();
    const registry = new InMemoryToolRegistry();
    const pending = new AuthPendingRegistry();
    await mountMcpServers(registry, process.env, () => {}, { cwd: home, pending });
    expect(pending.has("remote")).toBe(true);

    // Simulate the completed OAuth flow: the access token is now persisted.
    await saveMcpToken("remote", { access_token: "granted-token", token_type: "Bearer" }, process.env);

    const tool = buildMcpAuthTool(registry, pending);
    const res = await tool.execute({ server: "remote" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("authorized");
    expect(res.output).toContain("mcp_remote_ping");
    expect(registry.schemas().some((s) => s.name === "mcp_remote_ping")).toBe(true);
    expect(pending.has("remote")).toBe(false);
  });

  it("does not leak the auth URL or token through describeForSafety", () => {
    const tool = buildMcpAuthTool(new InMemoryToolRegistry(), new AuthPendingRegistry());
    expect(tool.describeForSafety?.({ server: "remote" })).toBe("mcp auth remote");
  });
});
