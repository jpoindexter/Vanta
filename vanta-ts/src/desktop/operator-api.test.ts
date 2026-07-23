import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";

describe("desktop operator routes", () => {
  let home = "";
  let root = "";
  const originalHome = process.env.VANTA_HOME;
  const originalOsHome = process.env.HOME;
  const originalTelegram = process.env.VANTA_TELEGRAM_TOKEN;
  const originalTelegramAllow = process.env.VANTA_TELEGRAM_ALLOW;
  const originalTelegramApiBase = process.env.VANTA_TELEGRAM_API_BASE;
  const originalProvider = process.env.VANTA_PROVIDER;
  const originalTrelloKey = process.env.VANTA_TRELLO_KEY;
  const originalTrelloToken = process.env.VANTA_TRELLO_TOKEN;
  const originalDropboxToken = process.env.VANTA_DROPBOX_TOKEN;
  const originalTrelloApiBase = process.env.VANTA_TRELLO_API_BASE;
  const originalDropboxApiBase = process.env.VANTA_DROPBOX_API_BASE;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-operator-api-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-operator-api-root-"));
    process.env.VANTA_HOME = home;
    process.env.HOME = home;
    delete process.env.VANTA_TELEGRAM_TOKEN;
    delete process.env.VANTA_TELEGRAM_ALLOW;
    delete process.env.VANTA_TELEGRAM_API_BASE;
    delete process.env.VANTA_TRELLO_KEY;
    delete process.env.VANTA_TRELLO_TOKEN;
    delete process.env.VANTA_DROPBOX_TOKEN;
    delete process.env.VANTA_TRELLO_API_BASE;
    delete process.env.VANTA_DROPBOX_API_BASE;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
    if (originalOsHome === undefined) delete process.env.HOME; else process.env.HOME = originalOsHome;
    if (originalTelegram === undefined) delete process.env.VANTA_TELEGRAM_TOKEN; else process.env.VANTA_TELEGRAM_TOKEN = originalTelegram;
    if (originalTelegramAllow === undefined) delete process.env.VANTA_TELEGRAM_ALLOW; else process.env.VANTA_TELEGRAM_ALLOW = originalTelegramAllow;
    if (originalTelegramApiBase === undefined) delete process.env.VANTA_TELEGRAM_API_BASE; else process.env.VANTA_TELEGRAM_API_BASE = originalTelegramApiBase;
    if (originalProvider === undefined) delete process.env.VANTA_PROVIDER; else process.env.VANTA_PROVIDER = originalProvider;
    if (originalTrelloKey === undefined) delete process.env.VANTA_TRELLO_KEY; else process.env.VANTA_TRELLO_KEY = originalTrelloKey;
    if (originalTrelloToken === undefined) delete process.env.VANTA_TRELLO_TOKEN; else process.env.VANTA_TRELLO_TOKEN = originalTrelloToken;
    if (originalDropboxToken === undefined) delete process.env.VANTA_DROPBOX_TOKEN; else process.env.VANTA_DROPBOX_TOKEN = originalDropboxToken;
    if (originalTrelloApiBase === undefined) delete process.env.VANTA_TRELLO_API_BASE; else process.env.VANTA_TRELLO_API_BASE = originalTrelloApiBase;
    if (originalDropboxApiBase === undefined) delete process.env.VANTA_DROPBOX_API_BASE; else process.env.VANTA_DROPBOX_API_BASE = originalDropboxApiBase;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  it("serves the same truthful integration catalog to desktop", async () => {
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/connect/integrations`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "trello", state: "needs_setup", actions: ["configure"] }),
        expect.objectContaining({ id: "dropbox", state: "needs_setup", actions: ["configure"] }),
        expect.objectContaining({ id: "box", state: "installable", actions: ["install"] }),
      ]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("runs bounded Trello and Dropbox tests through the desktop action route", async () => {
    const provider = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(req.url?.includes("trello") ? JSON.stringify([{ id: "board", name: "Fixture board" }]) : JSON.stringify({ entries: [], cursor: "cursor", has_more: false }));
    });
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    const address = provider.address();
    if (!address || typeof address === "string") throw new Error("provider fixture did not bind");
    process.env.VANTA_TRELLO_KEY = "key";
    process.env.VANTA_TRELLO_TOKEN = "token";
    process.env.VANTA_TRELLO_API_BASE = `http://127.0.0.1:${address.port}/trello`;
    process.env.VANTA_DROPBOX_TOKEN = "token";
    process.env.VANTA_DROPBOX_API_BASE = `http://127.0.0.1:${address.port}/dropbox`;
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const desktop = server.address();
    if (!desktop || typeof desktop === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${desktop.port}/api/connect/integrations`;
    try {
      const trello = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "trello", action: "test" }) });
      const dropbox = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "dropbox", action: "test" }) });
      const trelloBody = await trello.json() as { message: string; integrations: unknown[] };
      const dropboxBody = await dropbox.json() as { message: string; integrations: unknown[] };
      expect(trelloBody.message).toBe("Trello connection test passed.");
      expect(trelloBody.integrations).toContainEqual(expect.objectContaining({ id: "trello", receipt: expect.objectContaining({ action: "test", outcome: "passed" }) }));
      expect(dropboxBody.message).toBe("Dropbox connection test passed.");
      expect(dropboxBody.integrations).toContainEqual(expect.objectContaining({ id: "dropbox", receipt: expect.objectContaining({ action: "test", outcome: "passed" }) }));
    } finally {
      await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => provider.close(() => resolve()))]);
    }
  });

  it("installs the Box hosted MCP pack through the integration action route", async () => {
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/connect/integrations`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "box", action: "install" }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as { message: string; integrations: unknown[] };
      expect(body.message).toContain("Installed box-remote-mcp");
      expect(body.integrations).toContainEqual(expect.objectContaining({ id: "box", state: "installed", actions: ["configure", "manage_mcp"], receipt: expect.objectContaining({ action: "install", outcome: "passed" }) }));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("answers Telegram setup without initializing a missing model provider", async () => {
    process.env.VANTA_PROVIDER = "provider-that-does-not-exist";
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/setup/messaging/telegram`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        state: "unconfigured",
        action: { id: "configure", command: "vanta setup messaging telegram" },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("lists real adapters and persists a selected adapter through the desktop API", async () => {
    const telegram = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { username: "vanta_test" } }));
    });
    await new Promise<void>((resolve) => telegram.listen(0, "127.0.0.1", resolve));
    const telegramAddress = telegram.address();
    if (!telegramAddress || typeof telegramAddress === "string") throw new Error("Telegram fixture did not bind");
    process.env.VANTA_TELEGRAM_API_BASE = `http://127.0.0.1:${telegramAddress.port}`;
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
      const token = `123456:${"a".repeat(35)}`;
      const saved = await fetch(`${base}/api/messaging`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "telegram", values: { VANTA_TELEGRAM_TOKEN: token, accessMode: "pairing" } }) });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ id: "telegram", status: "ready", configured: true });
      const afterTest = await fetch(`${base}/api/connect/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "messaging", id: "telegram" }) });
      expect(await afterTest.json()).toMatchObject({ status: "ready", message: expect.stringContaining("credential is live") });
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => telegram.close(() => resolve())),
      ]);
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
