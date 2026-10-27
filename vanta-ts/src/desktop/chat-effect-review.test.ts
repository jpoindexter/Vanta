import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type http from "node:http";
import { Readable } from "node:stream";
import { handleChat } from "./handler-chat.js";
import { handleQueueChat } from "./handler-queue.js";
import { handleRunAction } from "./handler-runs.js";
import { DesktopTurnQueue, fileTurnQueueDeps } from "./turn-queue.js";
import type { DesktopState } from "./handler-state.js";
import type { AgentOutcome } from "../agent.js";
import type { RunSetup } from "../session.js";
import { loadSession } from "../sessions/store.js";
import { listRuns } from "../runs/store.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { deriveLegacyRuns } from "../runs/legacy.js";

const homes: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); });

function request(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as http.IncomingMessage;
}

function response() {
  let status = 0;
  let raw = "{}";
  const res = { writeHead(value: number) { status = value; }, end(value: string) { raw = value; } } as unknown as http.ServerResponse;
  return { res, result: () => ({ status, body: JSON.parse(raw) as Record<string, unknown> }) };
}

async function fixture(needsEffectReview = true) {
  const home = await mkdtemp(join(tmpdir(), "vanta-controller-effect-")); homes.push(home); vi.stubEnv("VANTA_HOME", home);
  const frames: string[] = [];
  const queuePath = join(home, "queue.json");
  const outcome: AgentOutcome = { finalText: "Partial text retained.", iterations: 1, stoppedReason: "done", toolIterations: needsEffectReview ? 1 : 0,
    completionState: "unverified", usage: { inputTokens: 20, outputTokens: 5 }, ...(needsEffectReview ? { needsEffectReview: true } : {}) };
  const state: DesktopState = { root: home, sessionId: "review-session", sessionStarted: new Date().toISOString(), accessMode: "approve",
    setup: { provider: { modelId: () => "fixture", contextWindow: () => 100000 }, goals: [], registry: { list: () => [] }, safety: {}, systemPrompt: "" } as unknown as RunSetup,
    _turnQueue: new DesktopTurnQueue(fileTurnQueueDeps(queuePath)), _sseSessionId: "default",
    _sseClients: new Map([["default", new Set([{ typed: true, response: { write: (value: string) => frames.push(value) } as unknown as http.ServerResponse, encode: event => ({ data: event }) }])]]) };
  const send = vi.fn(async (text: string) => { state.convo!.messages.push({ role: "user", content: text }, { role: "assistant", content: outcome.finalText }); return outcome; });
  state.convo = { messages: [{ role: "system", content: "test" }], send, setProvider() {}, setSessionMemory() {} };
  const target = { sessionId: state.sessionId!, root: home, controllerId: "local", model: "fixture", accessMode: "approve" as const };
  return { home, state, frames, send, target, queuePath };
}

describe("Desktop uncertain effect settlement", () => {
  it("agrees across HTTP, SSE, reopened receipt and captured run without unsafe recovery", async () => {
    const f = await fixture(); const reply = response();
    await handleChat(f.state, request({ message: "Handle the action" }), reply.res);
    expect(reply.result()).toMatchObject({ status: 200, body: { stoppedReason: "blocked", receipt: { status: "failed", needsEffectReview: true, actions: ["edit_request"] }, usage: { inputTokens: 20, outputTokens: 5 } } });
    expect(f.frames.some(frame => frame.includes('"type":"turn.complete"') && frame.includes('"stoppedReason":"blocked"'))).toBe(true);
    const stored = await loadSession(f.state.sessionId!, { VANTA_HOME: f.home });
    expect(stored?.messages.at(-1)).toMatchObject({ content: "Partial text retained.", desktopRun: { needsEffectReview: true, actions: ["edit_request"] } });
    expect(deriveLegacyRuns(stored!, f.home)[0]).toMatchObject({ status: "failed", needsEffectReview: true });
    expect((await listRuns({}, { VANTA_HOME: f.home }))[0]).toMatchObject({ status: "failed", needsEffectReview: true, usage: { inputTokens: 20, outputTokens: 5 } });
  });

  it("keeps ordinary unverified chat done", async () => {
    const f = await fixture(false); const reply = response();
    await handleChat(f.state, request({ message: "Hello" }), reply.res);
    expect(reply.result()).toMatchObject({ body: { stoppedReason: "done", receipt: { status: "done", actions: [] } } });
  });
});

it("runs the real agent-to-controller settlement and preserves its unknown effect on reload", async () => {
  const f = await fixture(false);
  const execute = vi.fn(async () => ({ ok: false, output: "Partial remote effect", effectDisposition: "unknown" as const }));
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "fixture", description: "private", parameters: {} }, execute });
  const complete = vi.fn().mockResolvedValue({ text: "Prepared partial text.", toolCalls: [{ id: "actual-call", name: "fixture", arguments: {} }], finishReason: "tool_calls", usage: { inputTokens: 7, outputTokens: 3 } });
  f.state.setup!.registry = registry;
  f.state.setup!.safety = { assess: async () => ({ risk: "allow", reason: "private fixture" }), logEvent: async () => {} } as unknown as RunSetup["safety"];
  f.state.setup!.provider = { modelId: () => "fixture", contextWindow: () => 100000, complete };
  f.state.convo = undefined;
  await f.state._turnQueue!.enqueue({ instruction: "Must wait", target: f.target });
  const reply = response(); await handleChat(f.state, request({ message: "Handle action" }), reply.res);
  expect(reply.result()).toMatchObject({ body: { stoppedReason: "blocked", receipt: { needsEffectReview: true, actions: ["edit_request"] }, usage: { inputTokens: 7, outputTokens: 3 } } });
  expect(complete).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce();
  const stored = await loadSession(f.state.sessionId!, { VANTA_HOME: f.home });
  expect(stored?.messages.some(message => message.role === "tool" && message.effectDisposition === "unknown")).toBe(true);
  expect(stored?.messages.at(-1)).toMatchObject({ desktopRun: { stoppedReason: "blocked", needsEffectReview: true } });
});

it("retains review-only recovery and reported usage if first queue settlement fails", async () => {
  const f = await fixture(); await f.state._turnQueue!.enqueue({ instruction: "Must wait", target: f.target });
  vi.spyOn(f.state._turnQueue!, "pauseForEffectReview").mockRejectedValueOnce(new Error("private queue write failure"));
  const reply = response(); await handleChat(f.state, request({ message: "Handle action" }), reply.res);
  expect(reply.result()).toMatchObject({ body: { stoppedReason: "blocked", receipt: { needsEffectReview: true, actions: ["edit_request"] }, usage: { inputTokens: 20, outputTokens: 5 } } });
  expect((await f.state._turnQueue!.list()).items[0]).toMatchObject({ status: "failed", failure: { requiresReview: true } });
  expect(f.send).toHaveBeenCalledOnce();
});

it("refuses cold queue replay when both pause writes failed, even after transcript compaction", async () => {
  const f = await fixture();
  await f.state._turnQueue!.enqueue({ instruction: "Uncertain queued action", target: f.target });
  await f.state._turnQueue!.enqueue({ instruction: "Must wait", target: f.target });
  vi.spyOn(f.state._turnQueue!, "pauseForEffectReview").mockRejectedValue(new Error("private persistent queue write failure"));
  await handleChat(f.state, request({ resumeQueue: true }), response().res);
  expect(f.send).toHaveBeenCalledOnce();
  const stored = await loadSession(f.state.sessionId!, { VANTA_HOME: f.home });
  expect(stored?.messages.at(-1)).toMatchObject({ desktopRun: { needsEffectReview: true } });
  const realDeps = fileTurnQueueDeps(f.queuePath);
  f.state._turnQueue = new DesktopTurnQueue({ ...realDeps, isAlive: () => false });
  // Discard live receipt evidence so the first cold admission must read the saved session.
  f.state.convo!.messages.splice(0, f.state.convo!.messages.length, { role: "system", content: "Fresh process" });
  const cold = response(); await handleChat(f.state, request({ resumeQueue: true }), cold.res);
  expect(cold.result().status).toBe(409);
  expect(f.send).toHaveBeenCalledOnce();
  // The independently saved run remains authoritative if a later compaction omits old receipts.
  f.state.convo!.messages.splice(0, f.state.convo!.messages.length, { role: "system", content: "Compacted summary" });
  const { saveSession } = await import("../sessions/store.js");
  await saveSession(f.state.sessionId!, f.state.convo!.messages);
  const compacted = response(); await handleChat(f.state, request({ resumeQueue: true }), compacted.res);
  expect(compacted.result().status).toBe(409);
  expect(f.send).toHaveBeenCalledOnce();
});

it("still drains an ordinary successful queue without uncertain evidence", async () => {
  const f = await fixture(false);
  await f.state._turnQueue!.enqueue({ instruction: "Ordinary followup", target: f.target });
  const reply = response(); await handleChat(f.state, request({ message: "Hello" }), reply.res);
  expect(reply.result()).toMatchObject({ body: { stoppedReason: "done", receipt: { status: "done" } } });
  expect(f.send).toHaveBeenCalledTimes(2);
  expect((await f.state._turnQueue!.list()).items).toHaveLength(0);
});

describe("uncertain queue and replay recovery", () => {
  it("retains the claimed item and pauses followers after reload without permitting Retry", async () => {
    const f = await fixture();
    await f.state._turnQueue!.enqueue({ instruction: "First queued action", target: f.target });
    await f.state._turnQueue!.enqueue({ instruction: "Followup", target: f.target });
    await handleChat(f.state, request({ resumeQueue: true }), response().res);
    expect(f.send).toHaveBeenCalledOnce();
    f.state._turnQueue = new DesktopTurnQueue(fileTurnQueueDeps(f.queuePath));
    const snapshot = await f.state._turnQueue.list(f.target.sessionId);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.every(item => item.status === "failed" && item.failure?.requiresReview === true)).toBe(true);
    const retry = response(); const item = snapshot.items[0]!;
    await handleQueueChat(f.state, request({ action: "retry", id: item.id, revision: item.revision }), retry.res);
    expect(retry.result()).toMatchObject({ status: 409, body: { code: "review_required" } });
    const resumed = response(); await handleChat(f.state, request({ resumeQueue: true }), resumed.res);
    expect(resumed.result().status).toBe(409);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it("does not drain followers after an unqueued uncertain action", async () => {
    const f = await fixture(); await f.state._turnQueue!.enqueue({ instruction: "Followup", target: f.target });
    await handleChat(f.state, request({ message: "Handle action" }), response().res);
    expect(f.send).toHaveBeenCalledOnce();
    expect((await f.state._turnQueue!.list()).items[0]).toMatchObject({ status: "failed", failure: { requiresReview: true } });
  });

  it("refuses library replay or checkpoint fork for the uncertain captured run", async () => {
    const f = await fixture(); await handleChat(f.state, request({ message: "Handle action" }), response().res);
    const run = (await listRuns({}, { VANTA_HOME: f.home }))[0]!;
    const priorSession = f.state.sessionId;
    for (const action of ["replay", "fork"]) {
      const reply = response(); await handleRunAction(f.state, request({ action, id: run.id }), reply.res);
      expect(reply.result().status).toBe(409);
      expect(f.state.sessionId).toBe(priorSession);
    }
  });
});
