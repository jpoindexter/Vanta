import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMcpConfig, mcpToolToVantaTool, buildMcpChildEnv } from "./mount.js";

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
    const cfg = await readMcpConfig({ VANTA_HOME: "/nonexistent-vanta-home-xyz" } as NodeJS.ProcessEnv);
    expect(cfg.servers).toEqual({});
  });

  it("accepts mcpServers key in inline config (the common mcpServers convention)", async () => {
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
    const dir = await mkdtemp(join(tmpdir(), "vanta-mcp-"));
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
    const dir = await mkdtemp(join(tmpdir(), "vanta-mcp-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-home-"));
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

describe("mcpToolToVantaTool", () => {
  const fakeClient = { callTool: async (_n: string, a: Record<string, unknown>) => `ran with ${JSON.stringify(a)}` };

  it("maps an MCP tool def to an OpenAI-safe-named Vanta tool", () => {
    const tool = mcpToolToVantaTool(fakeClient, "files", {
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
    const tool = mcpToolToVantaTool(fakeClient, "files", { name: "write" });
    expect(tool.describeForSafety?.({ path: "/etc/x" })).toContain("mcp files write");
    expect(tool.describeForSafety?.({ path: "/etc/x" })).toContain("/etc/x");
  });

  it("executes by proxying to the MCP client", async () => {
    const tool = mcpToolToVantaTool(fakeClient, "files", { name: "read" });
    const res = await tool.execute({ path: "a.txt" }, {} as never);
    expect(res).toEqual({ ok: true, output: 'ran with {"path":"a.txt"}' });
  });

  it("returns an error result (not a throw) when the call fails", async () => {
    const failing = {
      callTool: async () => {
        throw new Error("server gone");
      },
    };
    const tool = mcpToolToVantaTool(failing, "files", { name: "read" });
    const res = await tool.execute({}, {} as never);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("server gone");
  });
});

describe("buildMcpChildEnv", () => {
  const base = {
    PATH: "/usr/bin:/bin",
    HOME: "/home/op",
    OPENAI_API_KEY: "sk-secret-should-not-leak",
    ANTHROPIC_API_KEY: "ant-secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
  } as NodeJS.ProcessEnv;

  it("excludes operator secrets by default", () => {
    const out = buildMcpChildEnv(base);
    expect(out.OPENAI_API_KEY).toBeUndefined();
    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
    expect(out.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("includes safe non-secret vars like PATH and HOME", () => {
    const out = buildMcpChildEnv(base);
    expect(out.PATH).toBe("/usr/bin:/bin");
    expect(out.HOME).toBe("/home/op");
  });

  it("includes the server's own declared spec.env", () => {
    const out = buildMcpChildEnv(base, { MY_SERVER_FLAG: "1", FOO: "bar" });
    expect(out.MY_SERVER_FLAG).toBe("1");
    expect(out.FOO).toBe("bar");
    expect(out.OPENAI_API_KEY).toBeUndefined();
  });

  it("resolves only explicitly declared credential placeholders", () => {
    const out = buildMcpChildEnv({ ...base, GITHUB_TOKEN: "secret", OTHER_TOKEN: "hidden" }, { TOKEN: "${GITHUB_TOKEN}" });
    expect(out.TOKEN).toBe("secret");
    expect(out.GITHUB_TOKEN).toBeUndefined();
    expect(out.OTHER_TOKEN).toBeUndefined();
  });

  it("lets a server's declared env override a safe parent var", () => {
    const out = buildMcpChildEnv(base, { PATH: "/custom/bin" });
    expect(out.PATH).toBe("/custom/bin");
  });

  it("omits safe keys that are absent from the parent (no undefined entries)", () => {
    const out = buildMcpChildEnv({ PATH: "/bin" } as NodeJS.ProcessEnv);
    expect("HOME" in out).toBe(false);
    expect(out.PATH).toBe("/bin");
  });

  it("VANTA_MCP_FULL_ENV=1 passes the full parent env through (escape hatch)", () => {
    const out = buildMcpChildEnv({ ...base, VANTA_MCP_FULL_ENV: "1" }, { FOO: "bar" });
    expect(out.OPENAI_API_KEY).toBe("sk-secret-should-not-leak");
    expect(out.FOO).toBe("bar");
  });
});
