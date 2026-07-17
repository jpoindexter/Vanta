import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readMcpReceipts, readMcpRegistry } from "../mcp/registry.js";
import { runMcpCommand } from "./mcp-cmd.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "vanta-mcp-command-"));
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  const server = join(root, "server.mjs");
  await writeFile(server, `
    import readline from "node:readline";
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      const msg = JSON.parse(line);
      if (msg.id === undefined) return;
      let result = {};
      if (msg.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} } };
      if (msg.method === "tools/list") result = { tools: [{ name: "read_note", description: "Read a note", inputSchema: { type: "object" } }] };
      if (msg.method === "resources/list") result = { resources: [{ uri: "notes://today", name: "Today" }] };
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
    });
  `);
  await writeFile(join(root, ".mcp.json"), JSON.stringify({ servers: { notes: { command: process.execPath, args: [server] } } }));
  return { root, home };
}

describe("vanta mcp connector commands", () => {
  it("tests a real stdio connector and persists shared inventory plus a receipt", async () => {
    const { root, home } = await fixture();
    vi.stubEnv("VANTA_HOME", home);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMcpCommand(root, ["test", "notes"]);

    expect(log).toHaveBeenCalledWith("  notes: connected · 1 tools · 1 resources");
    expect((await readMcpRegistry(root, process.env))[0]).toMatchObject({ health: "needs_setup", trust: "pending", tools: ["read_note"], resources: ["notes://today"] });
    await runMcpCommand(root, ["trust", "notes", "allow"]);
    expect((await readMcpRegistry(root, process.env))[0]).toMatchObject({ health: "ready", trust: "trusted" });
    await runMcpCommand(root, ["reconnect", "notes"]);
    expect(await readMcpReceipts(root)).toEqual([
      expect.objectContaining({ action: "test", server: "notes", outcome: "passed" }),
      expect.objectContaining({ action: "trust", server: "notes", outcome: "passed" }),
      expect.objectContaining({ action: "reconnect", server: "notes", outcome: "passed" }),
    ]);
  });

  it("shares enablement and trust decisions with list output", async () => {
    const { root, home } = await fixture();
    vi.stubEnv("VANTA_HOME", home);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runMcpCommand(root, ["disable", "notes"]);
    await runMcpCommand(root, ["trust", "notes", "deny"]);
    await runMcpCommand(root, ["list"]);

    expect((await readMcpRegistry(root, process.env))[0]).toMatchObject({ enabled: false, trust: "denied", health: "disabled" });
    expect(log.mock.calls.flat().join(" ")).toContain("disabled");
    expect((await readMcpReceipts(root)).map((receipt) => receipt.action)).toEqual(["disable", "trust"]);
  });

  it("records vetted catalog installs without storing credentials in receipts", async () => {
    const { root, home } = await fixture();
    vi.stubEnv("VANTA_HOME", home);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await runMcpCommand(root, ["install", "filesystem"]);

    expect(await readMcpReceipts(root)).toEqual([
      expect.objectContaining({ action: "install", server: "filesystem", outcome: "passed" }),
    ]);
  });
});
