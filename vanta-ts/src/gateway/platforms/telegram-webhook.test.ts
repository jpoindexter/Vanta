import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlatformWebhookServer } from "../platform-webhook.js";
import { readChannelProofs } from "../channel-proof.js";
import { startMessagingWebhook } from "../run.js";
import { pollPlatformSession } from "../run-session.js";
import { initialState } from "../session-manager.js";
import { TelegramAdapter } from "./telegram.js";

let webhookServer: PlatformWebhookServer | undefined;
let telegramServer: Server | undefined;
let dataDir: string | undefined;

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  await webhookServer?.close();
  await closeServer(telegramServer);
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  webhookServer = undefined;
  telegramServer = undefined;
  dataDir = undefined;
});

async function startTelegramApi(requests: Array<{ path: string; body: unknown }>): Promise<string> {
  telegramServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      requests.push({ path: req.url ?? "", body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url?.endsWith("/sendMessage")
        ? { ok: true, result: { message_id: 77 } }
        : { ok: true }));
    });
  });
  await new Promise<void>((resolve) => telegramServer!.listen(0, "127.0.0.1", resolve));
  const address = telegramServer.address();
  if (!address || typeof address === "string") throw new Error("Telegram API fixture did not bind");
  return `http://127.0.0.1:${address.port}`;
}

describe("Telegram messaging webhook", () => {
  it("runs authenticated HTTP update -> gateway turn -> Bot API reply", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const apiBase = await startTelegramApi(requests);
    const adapter = new TelegramAdapter({
      token: "T",
      webhookSecret: "signed-hook",
      apiBase,
      allow: new Set(["42"]),
    });
    webhookServer = await startMessagingWebhook(
      { platform: adapter, platformWebhookPort: 0 },
      () => {},
    );
    if (!webhookServer) throw new Error("messaging webhook server did not start");

    const response = await fetch(`http://127.0.0.1:${webhookServer.port}/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "signed-hook",
      },
      body: JSON.stringify({
        update_id: 9,
        message: {
          message_id: 101,
          text: "status",
          chat: { id: 42, type: "private" },
          from: { username: "jason" },
        },
      }),
    });
    expect(response.status).toBe(202);

    dataDir = await mkdtemp(join(tmpdir(), "vanta-telegram-webhook-"));
    const result = await pollPlatformSession({
      dataDir,
      run: async () => ({ finalText: "" }),
      load: async () => [],
      platform: adapter,
      handle: async (text) => `agent reply to ${text}`,
      now: () => new Date(2026, 6, 10, 12, 0),
      log: () => {},
    }, initialState());

    expect(result.count).toBe(1);
    expect(requests).toEqual([
      {
        path: "/botT/sendChatAction",
        body: { chat_id: "42", action: "typing" },
      },
      {
        path: "/botT/sendMessage",
        body: expect.objectContaining({ chat_id: "42", text: expect.stringContaining("agent reply to") }),
      },
    ]);
    expect(requests.some((request) => request.path.includes("getUpdates"))).toBe(false);
    expect(await readChannelProofs(dataDir)).toEqual([
      expect.objectContaining({
        kind: "channel-round-trip",
        platform: "telegram",
        transport: "bot-api",
        parts: 1,
      }),
    ]);
  });

  it("rejects a missing secret and malformed update without enqueueing", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const adapter = new TelegramAdapter({
      token: "T",
      webhookSecret: "signed-hook",
      apiBase: await startTelegramApi(requests),
    });
    webhookServer = await startMessagingWebhook(
      { platform: adapter, platformWebhookPort: 0 },
      () => {},
    );
    if (!webhookServer) throw new Error("messaging webhook server did not start");
    const url = `http://127.0.0.1:${webhookServer.port}/telegram/webhook`;
    expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(url, {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "signed-hook" },
      body: "{}",
    })).status).toBe(400);
    await expect(adapter.poll()).resolves.toEqual([]);
    expect(requests).toEqual([]);
  });
});
