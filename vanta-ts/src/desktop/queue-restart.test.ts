import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleChat, handleQueueChat, type DesktopState } from "./handlers.js";
import { desktopTurnQueues, handleQueueList } from "./handler-queue.js";
import type { TurnQueueSnapshot } from "./turn-queue.js";

// The durable queue is a file under VANTA_HOME. "Restart" here is a new DesktopState plus an empty in-process
// queue cache, so the only thing that can carry the list across is the file.

let home: string;
const originalHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-queue-restart-"));
  process.env.VANTA_HOME = home;
  desktopTurnQueues.clear();
});

afterEach(async () => {
  desktopTurnQueues.clear();
  if (originalHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = originalHome;
  await rm(home, { recursive: true, force: true });
});

function response() {
  let status = 0; let body = "";
  return {
    res: { writeHead: (next: number) => { status = next; }, end: (next: string) => { body = next; } } as any,
    result: () => ({ status, body: JSON.parse(body) }),
  };
}

function request(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const req = { on: (event: string, listener: (value?: Buffer) => void) => { if (event === "data") listener(Buffer.from(body)); if (event === "end") listener(); return req; } } as any;
  return req;
}

type Send = NonNullable<DesktopState["convo"]>["send"];
type Outcome = Awaited<ReturnType<Send>>;

const done = (finalText: string): Outcome => ({ finalText, iterations: 1, stoppedReason: "done", toolIterations: 0 });

function appState(send: Send, overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    root: "/repo",
    sessionId: "chat-1",
    sessionStarted: "2026-01-01T00:00:00.000Z",
    setup: { provider: { modelId: () => "fake" } as any, goals: [], registry: {} as any, safety: {} as any, systemPrompt: "" } as any,
    convo: { messages: [{ role: "system", content: "" }], send } as any,
    ...overrides,
  };
}

async function snapshotOf(state: DesktopState): Promise<TurnQueueSnapshot> {
  const reply = response();
  await handleQueueList(state, reply.res);
  return reply.result().body as TurnQueueSnapshot;
}

async function post(state: DesktopState, payload: Record<string, unknown>) {
  const reply = response();
  await handleQueueChat(state, request(payload), reply.res);
  return reply.result();
}

/** Three messages queued behind a running turn, then edited, reordered and cancelled. */
async function buildQueue(): Promise<void> {
  const state = appState(vi.fn(), { _chatActive: true });
  for (const message of ["alpha", "bravo", "charlie"]) await post(state, { message });
  const [alpha, bravo, charlie] = (await snapshotOf(state)).items;
  const edited = await post(state, { action: "edit", id: bravo!.id, revision: bravo!.revision, message: "bravo edited" });
  expect(edited.status).toBe(200);
  const afterEdit = (await snapshotOf(state)).items.find((item) => item.id === charlie!.id)!;
  expect((await post(state, { action: "move", id: charlie!.id, revision: afterEdit.revision, direction: "up" })).status).toBe(200);
  expect((await post(state, { action: "cancel", id: alpha!.id, revision: alpha!.revision })).status).toBe(200);
}

describe("durable turn queue across an app restart", () => {
  it("keeps the edited, reordered and trimmed list after a restart", async () => {
    await buildQueue();
    desktopTurnQueues.clear();

    const afterRestart = await snapshotOf(appState(vi.fn()));

    expect(afterRestart.items.map((item) => item.instruction)).toEqual(["charlie", "bravo edited"]);
    expect(afterRestart.items.every((item) => item.status === "queued")).toBe(true);
  });

  it("runs the saved queue in the edited order when asked, and empties it", async () => {
    await buildQueue();
    desktopTurnQueues.clear();
    const seen: string[] = [];
    const state = appState(vi.fn(async (instruction: string) => { seen.push(instruction); return done(`ran ${instruction}`); }));

    const reply = response();
    await handleChat(state, request({ resumeQueue: true, sessionId: "chat-1" }), reply.res);

    expect(seen).toEqual(["charlie", "bravo edited"]);
    expect(reply.result()).toMatchObject({ status: 200, body: { finalText: "ran bravo edited", stoppedReason: "done" } });
    expect((await snapshotOf(state)).items).toEqual([]);
  });

  it("answers nothing queued instead of starting an empty turn", async () => {
    const send = vi.fn();
    const reply = response();

    await handleChat(appState(send), request({ resumeQueue: true }), reply.res);

    expect(reply.result()).toEqual({ status: 409, body: { error: "nothing is queued" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a failed queued turn, with its reason, for a retry", async () => {
    await buildQueue();
    desktopTurnQueues.clear();
    const state = appState(vi.fn(async () => ({ finalText: "Stopped: same call repeated.", iterations: 3, stoppedReason: "repeated_failure" as const, toolIterations: 3 })));

    const reply = response();
    await handleChat(state, request({ resumeQueue: true }), reply.res);

    expect(reply.result().body).toMatchObject({ stoppedReason: "repeated_failure", receipt: { status: "failed", actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"], checkpoint: { instruction: "charlie" } } });
    const [failed, waiting] = (await snapshotOf(state)).items;
    expect(failed).toMatchObject({ instruction: "charlie", status: "failed", failure: { reason: "Task stopped after repeated failures." } });
    expect(waiting).toMatchObject({ instruction: "bravo edited", status: "queued" });

    const retried = await post(state, { action: "retry", id: failed!.id, revision: failed!.revision });
    expect(retried.status).toBe(200);
    expect((retried.body as TurnQueueSnapshot).items.map((item) => item.status)).toEqual(["queued", "queued"]);
  });

  it("answers a stale revision with a conflict and the current list", async () => {
    await buildQueue();
    const state = appState(vi.fn());
    const [first] = (await snapshotOf(state)).items;

    const conflict = await post(state, { action: "edit", id: first!.id, revision: first!.revision - 1, message: "late edit" });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "revision_conflict", error: "This queued turn changed. Refresh and try again." });
    expect((conflict.body.snapshot as TurnQueueSnapshot).items.map((item) => item.instruction)).toEqual(["charlie", "bravo edited"]);
  });

  it("returns the typed stop reason on a normal chat response", async () => {
    const reply = response();

    await handleChat(appState(vi.fn(async () => done("hello"))), request({ message: "hi" }), reply.res);

    expect(reply.result().body).toMatchObject({ finalText: "hello", stoppedReason: "done", receipt: { status: "done" } });
  });
});
