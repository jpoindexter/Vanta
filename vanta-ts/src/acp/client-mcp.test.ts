import { describe, expect, it, vi } from "vitest";
import { InMemoryToolRegistry, type ToolRegistry } from "../tools/registry.js";
import { buildClientMcpConfig, createClientMcpRegistry } from "./client-mcp.js";

const servers = [{
  name: "buzz",
  command: "buzz-mcp",
  args: ["serve"],
  env: [{ name: "BUZZ_PRIVATE_KEY", value: "secret" }],
}];

describe("ACP client-provided MCP servers", () => {
  it("converts ACP env pairs into Vanta's MCP config without logging secrets", () => {
    expect(buildClientMcpConfig(servers)).toEqual({
      servers: {
        buzz: {
          command: "buzz-mcp",
          args: ["serve"],
          env: { BUZZ_PRIVATE_KEY: "secret" },
        },
      },
    });
  });

  it("clones base tools and mounts client servers into a session registry", async () => {
    const base = new InMemoryToolRegistry();
    base.register({
      schema: { name: "read_file", description: "read", parameters: { type: "object" } },
      execute: async () => ({ ok: true, output: "ok" }),
    });
    const mount = vi.fn(async (registry: ToolRegistry, env: NodeJS.ProcessEnv) => {
      expect(env.VANTA_MCP_SERVERS).not.toContain("undefined");
      registry.register({
        schema: { name: "mcp_buzz_send_message", description: "send", parameters: { type: "object" } },
        execute: async () => ({ ok: true, output: "sent" }),
      });
      return { servers: ["buzz"], toolCount: 1, dispose: vi.fn() };
    });

    const result = await createClientMcpRegistry(base, servers, {
      cwd: "/repo",
      env: {},
      mount,
    });

    expect(result.registry.get("read_file")).toBeTruthy();
    expect(result.registry.get("mcp_buzz_send_message")).toBeTruthy();
    expect(mount).toHaveBeenCalledOnce();
  });
});
