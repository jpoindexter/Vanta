import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { VantaClient } from "../../packages/sdk/src/index.js";
import { issuePublicApiToken } from "../public-api/auth.js";
import { createDesktopServer } from "./server.js";
import { attachSse, getSession, legacyFrame, pushSseEvent, type SessionMap, type SseClients } from "./session-state.js";
import { approvalResolvedEvent, toolStartEvent } from "./typed-events.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const typedTool = toolStartEvent("tool-1", "read_file", { path: "a.ts" })!;

describe("legacyFrame (companion SSE)", () => {
  it("strips typed from labelled frames", () => {
    expect(legacyFrame({ label: "→ read_file", kind: "tool_start", name: "read_file", typed: typedTool })).toEqual({ data: { label: "→ read_file", kind: "tool_start", name: "read_file" } });
  });

  it("passes legacy frames through untouched", () => {
    expect(legacyFrame({ label: "", delta: "hi" })).toEqual({ data: { label: "", delta: "hi" } });
    expect(legacyFrame({ label: "note: x", kind: "note" })).toEqual({ data: { label: "note: x", kind: "note" } });
  });
});

describe("typed-only frame routing", () => {
  function client(encode?: (event: never) => { data: unknown }) {
    const writes: string[] = [];
    const clients: SseClients = new Map();
    const res = { writeHead: () => undefined, write: (chunk: string) => writes.push(chunk), on: () => undefined } as never;
    attachSse(clients, "s", res, encode as never);
    writes.length = 0;
    return { clients, writes };
  }
  const typedOnly = { label: "", typed: approvalResolvedEvent("1")! };

  it("delivers typed-only frames to default-encoder clients and withholds them from custom encoders", () => {
    const renderer = client(); const companion = client(legacyFrame as never);
    pushSseEvent(renderer.clients, "s", typedOnly);
    pushSseEvent(companion.clients, "s", typedOnly);
    expect(renderer.writes).toHaveLength(1);
    expect(JSON.parse(renderer.writes[0]!.slice(6))).toEqual(typedOnly);
    expect(companion.writes).toEqual([]);
  });

  it("still delivers legacy delta frames with an empty label to every client", () => {
    const companion = client(legacyFrame as never);
    pushSseEvent(companion.clients, "s", { label: "", delta: "hi" });
    expect(companion.writes).toHaveLength(1);
  });
});

describe("public API v1 SSE with typed events in flight", () => {
  it("skips typed-only frames and never exposes the typed field", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-typed-api-")); dirs.push(home);
    const sessions: SessionMap = new Map(); const sseClients: SseClients = new Map();
    const channelId = "typed-public";
    const state = getSession(sessions, channelId, join(process.cwd(), ".."));
    const issued = await issuePublicApiToken(home, "Typed events test");
    const server = createDesktopServer(state.root, { publicApi: true, home, port: 0, sessions, sseClients });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const client = new VantaClient({ baseUrl, token: issued.token, channelId });
      const stream = client.events();
      const first = stream.next();
      for (let attempt = 0; attempt < 100 && !sseClients.get(channelId)?.size; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
      pushSseEvent(sseClients, channelId, { label: "", typed: approvalResolvedEvent("1")! });
      pushSseEvent(sseClients, channelId, { label: "→ read_file", kind: "tool_start", name: "read_file", typed: typedTool });
      await expect(first).resolves.toEqual({ done: false, value: { apiVersion: "v1", type: "activity", sessionId: channelId, label: "→ read_file" } });
      await stream.return(undefined);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
