import { afterEach, describe, expect, it } from "vitest";
import { readMcpConfig, mcpToolToArgoTool } from "./mount.js";

describe("readMcpConfig", () => {
  const prev = process.env.ARGO_MCP_SERVERS;
  afterEach(() => {
    if (prev === undefined) delete process.env.ARGO_MCP_SERVERS;
    else process.env.ARGO_MCP_SERVERS = prev;
  });

  it("parses inline ARGO_MCP_SERVERS JSON", async () => {
    const cfg = await readMcpConfig({
      ARGO_MCP_SERVERS: JSON.stringify({
        servers: { files: { command: "mcp-fs", args: ["/tmp"] } },
      }),
    } as NodeJS.ProcessEnv);
    expect(cfg.servers.files).toEqual({ command: "mcp-fs", args: ["/tmp"] });
  });

  it("returns empty servers on malformed config", async () => {
    const cfg = await readMcpConfig({ ARGO_MCP_SERVERS: "{not json" } as NodeJS.ProcessEnv);
    expect(cfg.servers).toEqual({});
  });

  it("returns empty when no config is present", async () => {
    const cfg = await readMcpConfig({ ARGO_HOME: "/nonexistent-argo-home-xyz" } as NodeJS.ProcessEnv);
    expect(cfg.servers).toEqual({});
  });
});

describe("mcpToolToArgoTool", () => {
  const fakeClient = { callTool: async (_n: string, a: Record<string, unknown>) => `ran with ${JSON.stringify(a)}` };

  it("maps an MCP tool def to an OpenAI-safe-named Argo tool", () => {
    const tool = mcpToolToArgoTool(fakeClient, "files", {
      name: "read_file",
      description: "read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    });
    expect(tool.schema.name).toBe("mcp_files_read_file");
    expect(tool.schema.name).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(tool.schema.description).toBe("read a file");
    expect(tool.schema.parameters).toEqual({ type: "object", properties: { path: { type: "string" } } });
  });

  it("surfaces server/tool/args to the kernel via describeForSafety", () => {
    const tool = mcpToolToArgoTool(fakeClient, "files", { name: "write" });
    expect(tool.describeForSafety?.({ path: "/etc/x" })).toContain("mcp files write");
    expect(tool.describeForSafety?.({ path: "/etc/x" })).toContain("/etc/x");
  });

  it("executes by proxying to the MCP client", async () => {
    const tool = mcpToolToArgoTool(fakeClient, "files", { name: "read" });
    const res = await tool.execute({ path: "a.txt" }, {} as never);
    expect(res).toEqual({ ok: true, output: 'ran with {"path":"a.txt"}' });
  });

  it("returns an error result (not a throw) when the call fails", async () => {
    const failing = {
      callTool: async () => {
        throw new Error("server gone");
      },
    };
    const tool = mcpToolToArgoTool(failing, "files", { name: "read" });
    const res = await tool.execute({}, {} as never);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("server gone");
  });
});
