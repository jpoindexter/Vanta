import { describe, it, expect, vi } from "vitest";
import { gatherMcpConnections, reconnectServer } from "./connect.js";

// The view-shaping is covered in ui/mcp-view.test.ts; here we verify the IO
// layer's errors-as-values contract: no config → empty, bad spec → an error
// view (never a throw). Live stdio/http connects need a real server and are
// exercised end-to-end, not here.

describe("gatherMcpConnections — no config", () => {
  it("returns an empty list when no servers are configured", async () => {
    const conns = await gatherMcpConnections({ env: { VANTA_MCP_SERVERS: "{}" } as NodeJS.ProcessEnv, cwd: "/nonexistent" });
    expect(conns).toEqual([]);
  });

  it("treats malformed config as no servers (never throws)", async () => {
    const conns = await gatherMcpConnections({ env: { VANTA_MCP_SERVERS: "not json" } as NodeJS.ProcessEnv, cwd: "/nonexistent" });
    expect(conns).toEqual([]);
  });
});

describe("reconnectServer — unknown server", () => {
  it("returns an error view for a server not in config", async () => {
    const conn = await reconnectServer("ghost", { env: { VANTA_MCP_SERVERS: "{}" } as NodeJS.ProcessEnv, cwd: "/nonexistent" });
    expect(conn.status).toBe("error");
    expect(conn.error).toContain("not in config");
    expect(conn.tools).toEqual([]);
  });

  it("closes the obsolete client before attempting a replacement", async () => {
    const close = vi.fn();
    await reconnectServer("ghost", {
      env: { VANTA_MCP_SERVERS: "{}" } as NodeJS.ProcessEnv,
      cwd: "/nonexistent",
      previous: { name: "ghost", transport: "stdio", status: "connected", tools: [], client: { close } as never },
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
