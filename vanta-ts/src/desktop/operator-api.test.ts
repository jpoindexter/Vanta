import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";

describe("desktop operator routes", () => {
  let home = "";
  let root = "";
  const originalHome = process.env.VANTA_HOME;
  const originalOsHome = process.env.HOME;
  const originalTelegram = process.env.VANTA_TELEGRAM_TOKEN;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-operator-api-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-operator-api-root-"));
    process.env.VANTA_HOME = home;
    process.env.HOME = home;
    delete process.env.VANTA_TELEGRAM_TOKEN;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
    if (originalOsHome === undefined) delete process.env.HOME; else process.env.HOME = originalOsHome;
    if (originalTelegram === undefined) delete process.env.VANTA_TELEGRAM_TOKEN; else process.env.VANTA_TELEGRAM_TOKEN = originalTelegram;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  it("lists real adapters and persists a selected adapter through the desktop API", async () => {
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const adapters = await (await fetch(`${base}/api/messaging`)).json() as Array<{ id: string; status: string; configured: boolean }>;
      expect(adapters.find((adapter) => adapter.id === "telegram")).toMatchObject({ status: "needs_setup", configured: false });
      const beforeTest = await fetch(`${base}/api/connect/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "messaging", id: "telegram" }) });
      expect(await beforeTest.json()).toMatchObject({ status: "needs_setup" });
      const saved = await fetch(`${base}/api/messaging`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "telegram", values: { VANTA_TELEGRAM_TOKEN: "desktop-token" } }) });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ id: "telegram", status: "ready", configured: true });
      const afterTest = await fetch(`${base}/api/connect/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "messaging", id: "telegram" }) });
      expect(await afterTest.json()).toMatchObject({ status: "ready", message: expect.stringContaining("saved locally") });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reads and updates the shared project MCP connector registry", async () => {
    const fixture = join(root, "mcp-fixture.mjs");
    await writeFile(fixture, `
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  for (;;) {
    const index = buffer.indexOf("\\n");
    if (index < 0) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.id === undefined) continue;
    let result = {};
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "fixture", version: "1" } };
    if (request.method === "tools/list") result = { tools: [{ name: "search_notes", description: "Search notes", inputSchema: { type: "object", properties: {} } }] };
    if (request.method === "resources/list") result = { resources: [{ uri: "fixture://status", name: "Status" }] };
    if (request.method === "resources/read") result = { contents: [{ uri: request.params.uri, text: "fixture ready" }] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
  }
});
`);
    await writeFile(join(root, ".mcp.json"), JSON.stringify({ servers: { notes: { command: process.execPath, args: [fixture] } } }));
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect(await (await fetch(`${base}/api/connect/mcp`)).json()).toMatchObject({
        connectors: [expect.objectContaining({ name: "notes", source: "project", enabled: true, trust: "pending" })],
        catalog: expect.arrayContaining([expect.objectContaining({ name: "fetch", installed: false })]),
      });
      const trusted = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notes", action: "trust" }) });
      expect(await trusted.json()).toMatchObject({ connectors: [expect.objectContaining({ name: "notes", trust: "trusted" })] });
      const tested = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notes", action: "test" }) });
      expect(await tested.json()).toMatchObject({ result: { status: "connected", tools: ["search_notes"], resources: ["fixture://status"] } });
      const resource = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notes", action: "read_resource", uri: "fixture://status" }) });
      expect(await resource.json()).toMatchObject({ resource: { uri: "fixture://status", preview: expect.stringContaining("fixture ready") } });
      const disabled = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notes", action: "disable" }) });
      expect(await disabled.json()).toMatchObject({ connectors: [expect.objectContaining({ name: "notes", enabled: false, health: "disabled" })] });
      const removed = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notes", action: "remove" }) });
      expect(await removed.json()).toMatchObject({ connectors: [] });
      const installed = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "fetch", action: "install" }) });
      expect(await installed.json()).toMatchObject({ connectors: [expect.objectContaining({ name: "fetch", source: "user", trust: "pending" })] });
      await mkdir(join(home, "Library", "Application Support", "Claude"), { recursive: true });
      await writeFile(join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), JSON.stringify({ mcpServers: { "claude-notes": { command: process.execPath, args: [fixture] } } }));
      const imported = await fetch(`${base}/api/connect/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "import_desktop" }) });
      expect(await imported.json()).toMatchObject({ connectors: expect.arrayContaining([expect.objectContaining({ name: "claude-notes", source: "user" })]) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
