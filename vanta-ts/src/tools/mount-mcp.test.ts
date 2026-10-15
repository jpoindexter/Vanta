import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./registry.js";
import type { ToolContext } from "./types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stdioTransport = vi.hoisted(() => vi.fn((
  _command: string,
  _args: string[],
  _env: NodeJS.ProcessEnv,
) => ({
  transport: {},
  child: { kill: vi.fn() },
})));

vi.mock("../mcp/client.js", () => ({
  stdioTransport,
  McpClient: class MockMcpClient {
    async initialize(): Promise<void> {}
    async listTools(): Promise<[]> { return []; }
  },
}));

import { buildMountMcpTool } from "./mount-mcp.js";

afterEach(() => {
  delete process.env.VANTA_TEST_PARENT_SECRET;
  stdioTransport.mockClear();
});

describe("mount_mcp child boundary", () => {
  it("does not expose undeclared parent secrets to a model-selected server", async () => {
    process.env.VANTA_TEST_PARENT_SECRET = "must-not-cross";
    const registry = new ToolRegistry();
    const tool = buildMountMcpTool(registry);

    const root = await mkdtemp(join(tmpdir(), "vanta-mount-mcp-"));
    const result = await tool.execute({
      name: "bounded",
      command: "example-mcp",
      env: { EXPLICIT_SERVER_TOKEN: "declared" },
    }, {
      root,
      sessionId: "mount-mcp-test",
      safety: { assess: async () => ({ risk: "allow", reason: "test" }) } as unknown as ToolContext["safety"],
      requestApproval: async () => true,
    });

    expect(result.ok).toBe(true);
    expect(stdioTransport).toHaveBeenCalledOnce();
    const childEnv = stdioTransport.mock.calls[0]?.[2] as NodeJS.ProcessEnv;
    expect(childEnv.VANTA_TEST_PARENT_SECRET).toBeUndefined();
    expect(childEnv.EXPLICIT_SERVER_TOKEN).toBe("declared");
    await rm(root, { recursive: true, force: true });
  });
});
