import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { mountMcpServers } from "./mount.js";
import { allowTestEffectGate } from "../effects/test-gate.js";
import { buildToolSearchTool } from "../tools/tool-search.js";
import { buildSystemPrompt } from "../prompt.js";
import { connectServer, reconnectServer } from "./connect.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MCP launch trust boundary", () => {
  it("does not start an undecided server before the operator denies trust", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-trust-"));
    roots.push(root);
    const marker = join(root, "server-started");
    const server = join(root, "server.mjs");
    await writeFile(server, SERVER, "utf8");
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: {
          untrusted: {
            command: process.execPath,
            args: [server, marker],
          },
        },
      }),
    } as NodeJS.ProcessEnv;

    const result = await mountMcpServers(new ToolRegistry(), env, () => {}, {
      cwd: root,
      trust: { root, confirm: async () => false },
      effectGate: allowTestEffectGate(root),
    });
    result.dispose();

    await expect(readFile(marker, "utf8")).rejects.toThrow();
    expect(result.servers).toEqual([]);
    expect(result.toolCount).toBe(0);
  });

  it("requires a new decision when a trusted server launch definition changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-identity-"));
    roots.push(root);
    const server = join(root, "server.mjs");
    const firstMarker = join(root, "first-started");
    const changedMarker = join(root, "changed-started");
    await writeFile(server, SERVER, "utf8");
    let confirmations = 0;
    const confirm = async (): Promise<boolean> => {
      confirmations += 1;
      return confirmations === 1;
    };
    const config = (marker: string, revision: string): NodeJS.ProcessEnv => ({
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: {
          versioned: {
            command: process.execPath,
            args: [server, marker, revision],
          },
        },
      }),
    });

    const first = await mountMcpServers(new ToolRegistry(), config(firstMarker, "v1"), () => {}, {
      cwd: root,
      trust: { root, confirm },
      effectGate: allowTestEffectGate(root),
    });
    first.dispose();
    expect(await readFile(firstMarker, "utf8")).toBe("started");

    const changed = await mountMcpServers(new ToolRegistry(), config(changedMarker, "v2"), () => {}, {
      cwd: root,
      trust: { root, confirm },
      effectGate: allowTestEffectGate(root),
    });
    changed.dispose();

    expect(confirmations).toBe(2);
    await expect(readFile(changedMarker, "utf8")).rejects.toThrow();
  });
});

describe("MCP configured tool boundary", () => {
  async function mountWith(tools: string[] | undefined, deferred = false) {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-tools-"));
    roots.push(root);
    const server = join(root, "server.mjs");
    await writeFile(server, SERVER, "utf8");
    const spec = {
      command: process.execPath,
      args: [server, join(root, "started")],
      ...(tools === undefined ? {} : { tools }),
    };
    const registry = new ToolRegistry();
    const result = await mountMcpServers(registry, {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_DEFER: deferred ? "1" : "0",
      VANTA_MCP_SERVERS: JSON.stringify({ servers: { fixture: spec } }),
    } as NodeJS.ProcessEnv, () => {}, {
      cwd: root,
      effectGate: allowTestEffectGate(root),
    });
    return { root, registry, result };
  }

  it("mounts every discovered tool only when the tools field is absent", async () => {
    const { registry, result } = await mountWith(undefined);
    expect(registry.schemas().map((tool) => tool.name).sort()).toEqual([
      "mcp_fixture_read",
      "mcp_fixture_write",
    ]);
    expect(result.toolCount).toBe(2);
    result.dispose();
  });

  it("mounts and advertises exactly zero tools for tools: []", async () => {
    const { root, registry, result } = await mountWith([]);
    expect(result.toolCount).toBe(0);
    expect(registry.schemas()).toEqual([]);
    const search = buildToolSearchTool(registry);
    const searched = await search.execute({ query: "fixture" }, {} as never);
    expect(searched.output).toContain("no tools matched");
    const prompt = await buildSystemPrompt({
      root,
      soulPath: join(root, "missing-soul.md"),
      goals: [],
      tools: registry.schemas(),
      now: "2026-08-26T00:00:00.000Z",
    });
    expect(prompt).not.toContain("mcp_fixture_read");
    expect(prompt).not.toContain("mcp_fixture_write");
    result.dispose();
  });

  it("mounts only exact named tools and cannot reveal a denied deferred schema", async () => {
    const { registry, result } = await mountWith(["read"], true);
    expect(registry.schemas().map((tool) => tool.name)).toEqual(["mcp_fixture_read"]);
    expect(registry.get("mcp_fixture_write")).toBeUndefined();
    expect(registry.get("mcp_fixture_read")?.schema.parameters).toEqual({
      type: "object",
      properties: {},
      description: "Use tool_search to fetch the full schema before calling.",
    });
    result.dispose();
  });

  it("applies tools: [] to the Desktop/TUI connection inventory", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-connect-tools-"));
    roots.push(root);
    const server = join(root, "server.mjs");
    await writeFile(server, SERVER, "utf8");
    const connection = await connectServer("fixture", {
      command: process.execPath,
      args: [server, join(root, "started")],
      tools: [],
    }, { env: { PATH: process.env.PATH, HOME: process.env.HOME }, root });

    expect(connection.status).toBe("connected");
    expect(connection.tools).toEqual([]);
    connection.client?.close();
  });

  it("re-reads a narrowed policy on reconnect without widening the inventory", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-mcp-reconnect-tools-"));
    roots.push(root);
    const server = join(root, "server.mjs");
    await writeFile(server, SERVER, "utf8");
    const envFor = (tools: string[]) => ({
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      VANTA_MCP_SERVERS: JSON.stringify({
        servers: { fixture: { command: process.execPath, args: [server, join(root, "started")], tools } },
      }),
    } as NodeJS.ProcessEnv);

    const first = await reconnectServer("fixture", { env: envFor(["read"]), cwd: root });
    expect(first.tools.map((tool) => tool.name)).toEqual(["read"]);
    const narrowed = await reconnectServer("fixture", {
      env: envFor([]),
      cwd: root,
      previous: first,
    });
    expect(narrowed.tools).toEqual([]);
    narrowed.client?.close();
  });
});

const SERVER = String.raw`
import { writeFileSync } from "node:fs";
import readline from "node:readline";
writeFileSync(process.argv[2], "started");
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const result = message.method === "initialize"
    ? { protocolVersion: "2024-11-05", capabilities: {} }
    : message.method === "tools/list"
      ? { tools: [{ name: "read", description: "read" }, { name: "write", description: "write" }] }
      : {};
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
});
`;
