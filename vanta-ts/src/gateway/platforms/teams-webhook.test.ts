import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlatformWebhookServer } from "../platform-webhook.js";
import { startMessagingWebhook } from "../run.js";
import { pollPlatformSession } from "../run-session.js";
import { initialState } from "../session-manager.js";
import { TeamsAdapter, type TeamsTransport } from "./teams.js";
import { readChannelProofs } from "../channel-proof.js";

const SERVICE_URL = "https://smba.trafficmanager.net/teams";
let server: PlatformWebhookServer | undefined;
let dataDir: string | undefined;

function requireServer(value: PlatformWebhookServer | undefined): PlatformWebhookServer {
  if (!value) throw new Error("messaging webhook server did not start");
  server = value;
  return value;
}

afterEach(async () => {
  await server?.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  server = undefined;
  dataDir = undefined;
});

describe("Teams messaging webhook", () => {
  it("runs HTTP activity -> auth -> gateway turn -> Connector reply", async () => {
    const sends: unknown[] = [];
    const transport: TeamsTransport = {
      poll: async () => undefined,
      send: async (_url, conversationId, activity) => {
        sends.push({ conversationId, activity });
      },
    };
    const adapter = new TeamsAdapter({
      transport,
      allow: new Set(["U_alice"]),
      verifyActivity: async (authorization) => authorization === "Bearer signed",
    });
    const activeServer = requireServer(await startMessagingWebhook({ platform: adapter, platformWebhookPort: 0 }, () => {}));
    const activity = {
      type: "message",
      id: "activity-1",
      text: "status",
      serviceUrl: SERVICE_URL,
      conversation: { id: "C_alice", conversationType: "personal" },
      from: { id: "U_alice" },
    };
    const response = await fetch(`http://127.0.0.1:${activeServer.port}/api/messages`, {
      method: "POST",
      headers: { authorization: "Bearer signed", "content-type": "application/json" },
      body: JSON.stringify(activity),
    });
    expect(response.status).toBe(202);

    dataDir = await mkdtemp(join(tmpdir(), "vanta-teams-webhook-"));
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
    expect(sends).toEqual([{
      conversationId: "C_alice",
      activity: { type: "message", text: "agent reply to [Fri 2026-07-10 12:00] status" },
    }]);
    const proofs = await readChannelProofs(dataDir);
    expect(proofs).toHaveLength(1);
    expect(proofs[0]).toMatchObject({
      kind: "channel-round-trip",
      platform: "teams",
      transport: "bot-connector",
      parts: 1,
    });
    expect(JSON.stringify(proofs[0])).not.toContain("C_alice");
    expect(JSON.stringify(proofs[0])).not.toContain("activity-1");
  });

  it("rejects invalid auth and malformed JSON without enqueueing", async () => {
    const adapter = new TeamsAdapter({
      transport: { poll: async () => undefined, send: async () => {} },
      verifyActivity: async (authorization) => authorization === "Bearer signed",
    });
    const activeServer = requireServer(await startMessagingWebhook({ platform: adapter, platformWebhookPort: 0 }, () => {}));
    const url = `http://127.0.0.1:${activeServer.port}/api/messages`;
    expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(url, { method: "POST", headers: { authorization: "Bearer signed" }, body: "{" })).status).toBe(400);
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("does not persist a round-trip proof when the Connector send fails", async () => {
    const adapter = new TeamsAdapter({
      transport: {
        poll: async () => undefined,
        send: async () => { throw new Error("Connector unavailable"); },
      },
      verifyActivity: async () => true,
    });
    const activeServer = requireServer(await startMessagingWebhook({ platform: adapter, platformWebhookPort: 0 }, () => {}));
    const response = await fetch(`http://127.0.0.1:${activeServer.port}/api/messages`, {
      method: "POST",
      headers: { authorization: "Bearer signed" },
      body: JSON.stringify({
        type: "message",
        id: "activity-failed",
        text: "status",
        serviceUrl: SERVICE_URL,
        conversation: { id: "C_failed", conversationType: "personal" },
        from: { id: "U_failed" },
      }),
    });
    expect(response.status).toBe(202);
    dataDir = await mkdtemp(join(tmpdir(), "vanta-teams-webhook-failed-"));
    await pollPlatformSession({
      dataDir,
      run: async () => ({ finalText: "" }),
      load: async () => [],
      platform: adapter,
      handle: async () => "reply",
      log: () => {},
    }, initialState());
    expect(await readChannelProofs(dataDir)).toEqual([]);
  });

  it("returns 404 for unknown paths and 405 for non-POST requests", async () => {
    const adapter = new TeamsAdapter({
      transport: { poll: async () => undefined, send: async () => {} },
      verifyActivity: async () => true,
    });
    const activeServer = requireServer(await startMessagingWebhook({ platform: adapter, platformWebhookPort: 0 }, () => {}));
    expect((await fetch(`http://127.0.0.1:${activeServer.port}/nope`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${activeServer.port}/api/messages`)).status).toBe(405);
  });
});
