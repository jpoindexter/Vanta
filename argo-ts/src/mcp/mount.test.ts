import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMcpConfig, mcpToolToArgoTool } from "./mount.js";

describe("readMcpConfig", () => {
  const prev = process.env.VANTA_MCP_SERVERS;
  afterEach(() => {
    if (prev === undefined) delete process.env.VANTA_MCP_SERVERS;
    else process.env.VANTA_MCP_SERVERS = prev;
  });

  it("parses inline VANTA_MCP_SERVERS JSON", async () => {
    const cfg = await readMcpConfig({
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: { files: { command: "mcp-fs", args: ["/tmp"] } },
      }),
    } as NodeJS.ProcessEnv);
    expect(cfg.servers.files).toEqual({ command: "mcp-fs", args: ["/tmp"] });
  });

  it("returns empty servers on malformed config", async () => {
    const cfg = await readMcpConfig({ VANTA_MCP_SERVERS: "{not json" } as NodeJS.ProcessEnv);
    expect(cfg.servers).toEqual({});
  });

  it("returns empty when no config is present", async () => {
    const cfg = await readMcpConfig({ VANTA_HOME: "/nonexistent-argo-home-xyz" } as NodeJS.ProcessEnv);
    expect(cfg.servers).toEqual({});
  });

  it("accepts mcpServers key in inline config (Claude Code convention)", async () => {
    const cfg = await readMcpConfig({
      VANTA_MCP_SERVERS: JSON.stringify({
        mcpServers: { myserver: { command: "mcp-tool", args: ["--flag"] } },
      }),
    } as NodeJS.ProcessEnv);
    expect(cfg.servers.myserver).toEqual({ command: "mcp-tool", args: ["--flag"] });
  });

  it("merges servers and mcpServers with servers winning on conflict", async () => {
    const cfg = await readMcpConfig({
      VANTA_MCP_SERVERS: JSON.stringify({
        mcpServers: { a: { command: "from-mcp-servers" }, b: { command: "only-in-mcp" } },
        servers: { a: { command: "from-servers" } },
      }),
    } as NodeJS.ProcessEnv);
    expect(cfg.servers.a?.command).toBe("from-servers");
    expect(cfg.servers.b?.command).toBe("only-in-mcp");
  });

  it("discovers .mcp.json in cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argo-mcp-"));
    try {
      await writeFile(
        join(dir, ".mcp.json"),
        JSON.stringify({ mcpServers: { local: { command: "local-server" } } }),
        "utf8",
      );
      const cfg = await readMcpConfig({ VANTA_HOME: "/nonexistent" } as NodeJS.ProcessEnv, dir);
      expect(cfg.servers.local).toEqual({ command: "local-server" });
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("project-level .mcp.json wins over user-level ~/.vanta/mcp.json on conflict", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argo-mcp-"));
    const home = await mkdtemp(join(tmpdir(), "argo-home-"));
    try {
      await writeFile(
        join(dir, ".mcp.json"),
        JSON.stringify({ servers: { shared: { command: "project-cmd" } } }),
        "utf8",
      );
      await writeFile(
        join(home, "mcp.json"),
        JSON.stringify({ servers: { shared: { command: "user-cmd" }, only_user: { command: "u" } } }),
        "utf8",
      );
      const cfg = await readMcpConfig({ VANTA_HOME: home } as NodeJS.ProcessEnv, dir);
      expect(cfg.servers.shared?.command).toBe("project-cmd");
      expect(cfg.servers.only_user?.command).toBe("u");
    } finally {
      await rm(dir, { recursive: true });
      await rm(home, { recursive: true });
    }
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
