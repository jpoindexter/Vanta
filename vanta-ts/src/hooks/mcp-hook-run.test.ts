import { describe, it, expect, vi } from "vitest";

const mockReadMcpConfig = vi.hoisted(() => vi.fn());
const mockCallTool = vi.hoisted(() => vi.fn());
const mockInitialize = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());

vi.mock("../mcp/mount.js", () => ({ readMcpConfig: mockReadMcpConfig }));
vi.mock("../mcp/client.js", () => ({
  stdioTransport: vi.fn(() => ({
    transport: {},
    child: { kill: vi.fn() },
  })),
  McpClient: class MockMcpClient {
    constructor(_transport: unknown) {}
    initialize = mockInitialize;
    callTool = mockCallTool;
    close = mockClose;
  },
}));

import { runMcpToolHook } from "./mcp-hook-run.js";
import type { ShellHook } from "./shell-hooks.js";

const MCP_HOOK: ShellHook = { type: "mcp_tool", server: "notify", tool: "send_notification" };
const CONFIG = { servers: { notify: { command: "npx", args: ["notify-mcp"] } } };

describe("runMcpToolHook", () => {
  it("returns code 0 with tool output on success", async () => {
    mockReadMcpConfig.mockResolvedValueOnce(CONFIG);
    mockInitialize.mockResolvedValueOnce(undefined);
    mockCallTool.mockResolvedValueOnce("notified");

    const r = await runMcpToolHook(MCP_HOOK, '{"event":"PostToolUse"}', { cwd: "/tmp" });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("notified");
    expect(mockCallTool).toHaveBeenCalledWith("send_notification", expect.objectContaining({ event: "PostToolUse" }));
  });

  it("returns code 1 when the server is not in config", async () => {
    mockReadMcpConfig.mockResolvedValueOnce({ servers: {} });
    const r = await runMcpToolHook(MCP_HOOK, "{}", { cwd: "/tmp" });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/notify.*not in config/i);
  });

  it("returns code 1 when callTool throws", async () => {
    mockReadMcpConfig.mockResolvedValueOnce(CONFIG);
    mockInitialize.mockResolvedValueOnce(undefined);
    mockCallTool.mockRejectedValueOnce(new Error("mcp error"));
    const r = await runMcpToolHook(MCP_HOOK, "{}", { cwd: "/tmp" });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("mcp error");
  });

  it("returns code 1 when hook has no server/tool", async () => {
    const bare: ShellHook = { type: "mcp_tool" };
    const r = await runMcpToolHook(bare, "{}", { cwd: "/tmp" });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/requires server and tool/i);
  });

  it("parses non-JSON contextJson into a raw field", async () => {
    mockReadMcpConfig.mockResolvedValueOnce(CONFIG);
    mockInitialize.mockResolvedValueOnce(undefined);
    mockCallTool.mockResolvedValueOnce("ok");
    await runMcpToolHook(MCP_HOOK, "not-json", { cwd: "/tmp" });
    expect(mockCallTool).toHaveBeenCalledWith("send_notification", { raw: "not-json" });
  });
});
