import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleChat, handleQueueChat, type DesktopState } from "./handlers.js";
import { DesktopTurnQueue, desktopTurnQueuePath, type TurnQueueDeps } from "./turn-queue.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IMAGE = { mime: "image/png", dataBase64: PNG };

let home: string;
const originalHome = process.env.VANTA_HOME;

beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-queue-images-")); process.env.VANTA_HOME = home; });
afterEach(async () => {
  if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
  await rm(home, { recursive: true, force: true });
});

function reply() {
  let status = 0; let body = "";
  return { res: { writeHead: (next: number) => { status = next; }, end: (next: string) => { body = next; } } as any, result: () => ({ status, body: JSON.parse(body) }) };
}
const request = (payload: unknown) => {
  const raw = JSON.stringify(payload);
  const req = { on: (event: string, listener: (value?: Buffer) => void) => { if (event === "data") listener(Buffer.from(raw)); if (event === "end") listener(); return req; } } as any;
  return req;
};
function queue() {
  let raw: string | null = null; let id = 0;
  const deps: TurnQueueDeps = { read: async () => raw, write: async (value) => { raw = value; }, now: () => new Date("2026-07-17T12:00:00.000Z"), id: () => `queued-${++id}`, pid: () => 1, isAlive: () => true };
  return new DesktopTurnQueue(deps);
}
const imageFiles = async (root: string) => readdir(join(home, "desktop-turn-queues", "images")).catch(() => [] as string[]).then((files) => files.filter((file) => file.endsWith(".json")));
const done = { finalText: "ok", iterations: 1, stoppedReason: "done" as const, toolIterations: 0 };

function stateWith(send: (...args: any[]) => Promise<typeof done>): DesktopState {
  return {
    root: "/repo", sessionId: "desktop-test", sessionStarted: "2026-01-01T00:00:00.000Z", _turnQueue: queue(),
    setup: { provider: { modelId: () => "fake" } as any, goals: [], registry: {} as any, safety: {} as any, systemPrompt: "" } as any,
    convo: { messages: [{ role: "system", content: "" }], send } as any,
  };
}

describe("images queued behind a running turn", () => {
  it("are sent with the queued instruction when it runs, and removed afterwards", async () => {
    let state: DesktopState;
    const send = vi.fn(async (..._args: unknown[]) => {
      if (send.mock.calls.length === 1) {
        const queued = reply();
        await handleQueueChat(state, request({ message: "and this one", images: [IMAGE] }), queued.res);
        expect(queued.result()).toMatchObject({ status: 202, body: { item: { imageCount: 1, instruction: "and this one" } } });
        expect(await imageFiles(state.root)).toEqual(["queued-1.json"]);
      }
      return done;
    });
    state = stateWith(send);
    await handleChat(state, request({ message: "first", sessionId: "desktop-test" }), reply().res);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.slice(0, 2)).toEqual(["and this one", [IMAGE]]);
    expect(send.mock.calls[0]?.[1]).toBeUndefined();
    expect(await imageFiles(state.root)).toEqual([]);
    expect((await state._turnQueue!.list("desktop-test")).items).toEqual([]);
  });

  it("queue an image alone as a request to describe it", async () => {
    const state = stateWith(vi.fn(async () => done));
    state._chatActive = true;
    const queued = reply();
    await handleQueueChat(state, request({ images: [IMAGE] }), queued.res);
    expect(queued.result()).toMatchObject({ status: 202, body: { item: { instruction: "Describe the attached image.", imageCount: 1 } } });
  });

  it("are refused with the same rules as a chat message, and a cancelled item takes its images with it", async () => {
    const state = stateWith(vi.fn(async () => done));
    state._chatActive = true;
    const bad = reply();
    await handleQueueChat(state, request({ message: "x", images: [{ mime: "image/gif", dataBase64: PNG }] }), bad.res);
    expect(bad.result()).toEqual({ status: 400, body: { error: "images must be PNG, JPEG, or TIFF" } });
    const none = reply();
    await handleQueueChat(state, request({}), none.res);
    expect(none.result().status).toBe(400);

    const ok = reply();
    await handleQueueChat(state, request({ message: "keep", images: [IMAGE] }), ok.res);
    const item = ok.result().body.item;
    expect(await imageFiles(state.root)).toEqual(["queued-1.json"]);
    const cancelled = reply();
    await handleQueueChat(state, request({ action: "cancel", id: item.id, revision: item.revision }), cancelled.res);
    expect(cancelled.result().status).toBe(200);
    expect(await imageFiles(state.root)).toEqual([]);
    expect(desktopTurnQueuePath("/repo")).toContain("desktop-turn-queues");
  });
});
