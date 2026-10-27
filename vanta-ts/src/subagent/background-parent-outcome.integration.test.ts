import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConversation, type AgentDeps } from "../agent.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { LLMProvider } from "../providers/interface.js";
import { enqueueAsyncResult } from "./async-delegate.js";
import { runReplLoop, type ReplDeps } from "../interactive-repl.js";
import { executeUserTurn, type TurnDeps } from "../interactive-turn.js";
import { loadSession } from "../sessions/store.js";
import { listSpend } from "../cost/ledger.js";
import * as goalModule from "../repl/goal-condition.js";
import * as hookModule from "../hooks/shell-hooks.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const row = (id: string) => ({ id, goal: "Private worker", output: "Ordinary result", finishedAt: "now", ok: true });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-background-parent-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", root); vi.stubEnv("VANTA_AUTOCONTINUE", "0");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "write_file", description: "Private fixture", parameters: {} }, execute: async () => {
    await writeFile(join(root, "partial.txt"), "private partial effect");
    return { ok: false, effectDisposition: "unknown", output: "Unknown private effect" };
  } });
  const complete = vi.fn<LLMProvider["complete"]>().mockResolvedValue({ text: "Ordinary answer", toolCalls: [], finishReason: "stop" });
  complete.mockResolvedValueOnce({ text: "Partial text", toolCalls: [{ id: "private-effect", name: "write_file", arguments: {} }], finishReason: "tool_calls", usage: { inputTokens: 7, outputTokens: 2 } });
  const deps: AgentDeps = { root, registry, provider: { complete, modelId: () => "private-fixture", contextWindow: () => 100000 },
    safety: { assess: async () => ({ risk: "allow", reason: "Injected fixture gate" }), logEvent: async () => {} } as unknown as AgentDeps["safety"],
    requestApproval: async () => false };
  return { root, deps, complete, convo: createConversation("Private fixture", deps) };
}

function loopDeps(root: string, convo: ReturnType<typeof createConversation>, runUserTurn: unknown, answers: string[] = []): ReplDeps {
  return { convo, ctx: { dataDir: root }, runUserTurn,
    rl: { question: async () => { const line = answers.shift(); if (line !== undefined) return line; throw new Error("Private EOF"); } },
  } as unknown as ReplDeps;
}

describe("background consumer parent outcome", () => {
  it("does not acknowledge normally-resolved unknown parent work or run its arrived follower", async () => {
    const f = await fixture();
    await enqueueAsyncResult(f.root, row("first"));
    const run = vi.fn(async (text: string) => {
      const outcome = await f.convo.send(text);
      await enqueueAsyncResult(f.root, row("follower"));
      return outcome;
    });
    await runReplLoop(loopDeps(f.root, f.convo, run));
    expect(run).toHaveBeenCalledOnce(); expect(f.complete).toHaveBeenCalledOnce();
    expect(await readFile(join(f.root, "partial.txt"), "utf8")).toBe("private partial effect");
    const ledger = await readFile(join(f.root, "async-delegate.jsonl"), "utf8");
    expect(ledger).not.toContain('"event":"delivered"');
    const cold = vi.fn(async () => {});
    await runReplLoop(loopDeps(f.root, createConversation("Cold fixture", f.deps), cold));
    expect(cold).not.toHaveBeenCalled();
  });

  it.each([false, true])("holds prior unknown before idle, reconstructed=%s", async reconstruct => {
    const f = await fixture();
    expect(await f.convo.send("Private action")).toMatchObject({ needsEffectReview: true });
    const convo = reconstruct ? createConversation("Restored fixture", f.deps, { history: f.convo.messages }) : f.convo;
    await enqueueAsyncResult(f.root, row("follower"));
    const run = vi.fn(async (text: string) => convo.send(text));
    await runReplLoop(loopDeps(f.root, convo, run));
    expect(run).not.toHaveBeenCalled(); expect(f.complete).toHaveBeenCalledOnce();
  });
});

it("returns the real blocked outcome from executeUserTurn, retaining text/cost/session and skipping automatic continuations", async () => {
  const f = await fixture();
  vi.stubEnv("VANTA_PROVIDER", "openai");
  f.deps.provider.modelId = () => "gpt-5";
  const goal = vi.spyOn(goalModule, "checkGoalLoop").mockResolvedValue("Automatic retry prohibited");
  const hook = vi.spyOn(hookModule, "fireStopHook").mockResolvedValue("Automatic retry prohibited");
  const deps = { convo: f.convo, repoRoot: f.root,
    setup: { provider: f.deps.provider, safety: f.deps.safety, goals: [] },
    state: { sessionId: "20261027-184200", started: new Date().toISOString(), turnIndex: 0 },
    workingMemory: { isEmpty: () => true, format: () => "" },
    gatesRef: { current: {} }, autoHandoffNotedRef: { current: false },
  } as unknown as TurnDeps;
  const outcome = await executeUserTurn("Private action", deps);
  expect(outcome).toMatchObject({ stoppedReason: "blocked", needsEffectReview: true, usage: { inputTokens: 7, outputTokens: 2 } });
  expect(f.complete).toHaveBeenCalledOnce();
  expect(goal).not.toHaveBeenCalled(); expect(hook).not.toHaveBeenCalled();
  expect((await loadSession("20261027-184200"))?.messages).toEqual(f.convo.messages);
  expect((await listSpend(join(f.root, ".vanta")))[0]).toMatchObject({ inputTokens: 7, outputTokens: 2 });
  expect(await readFile(join(f.root, ".vanta", "async-delegate.jsonl"), "utf8")).toContain('"event":"review"');
});

describe("background pre-idle interruption", () => {
  it("holds a live interrupted outcome even without an unknown-effect marker", async () => {
    const f = await fixture();
    const controller = new AbortController(); controller.abort();
    expect(await f.convo.send("Interrupted", undefined, controller.signal)).toMatchObject({ stoppedReason: "interrupted" });
    await enqueueAsyncResult(f.root, row("follower"));
    const run = vi.fn(async (text: string) => f.convo.send(text));
    await runReplLoop(loopDeps(f.root, f.convo, run));
    expect(run).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
  });
});

describe("background parent continuity controls", () => {
  it("retains live uncertainty even after transcript compaction", async () => {
    const f = await fixture();
    await f.convo.send("Private action");
    f.convo.messages.splice(1);
    await enqueueAsyncResult(f.root, row("follower"));
    const run = vi.fn(async (text: string) => f.convo.send(text));
    await runReplLoop(loopDeps(f.root, f.convo, run));
    expect(run).not.toHaveBeenCalled(); expect(f.complete).toHaveBeenCalledOnce();
  });

  it("keeps explicit manual input available without releasing automatic followers", async () => {
    const f = await fixture();
    const run = vi.fn(async (text: string) => {
      const outcome = await f.convo.send(text);
      if (outcome.needsEffectReview) await enqueueAsyncResult(f.root, row("follower"));
      return outcome;
    });
    await runReplLoop(loopDeps(f.root, f.convo, run, ["Private action", "Explain status only"]));
    expect(run.mock.calls).toEqual([["Private action"], ["Explain status only"]]);
    expect(f.complete).toHaveBeenCalledTimes(2);
    const cold = vi.fn(async () => {});
    await runReplLoop(loopDeps(f.root, createConversation("Cold fixture", f.deps), cold));
    expect(cold).not.toHaveBeenCalled();
  });

  it("delivers ordinary completed unverified results and a new follower once each", async () => {
    const f = await fixture();
    f.complete.mockReset().mockResolvedValue({ text: "Ordinary answer", toolCalls: [], finishReason: "stop" });
    await enqueueAsyncResult(f.root, row("first"));
    const run = vi.fn(async (text: string) => {
      const outcome = await f.convo.send(text);
      if (run.mock.calls.length === 1) await enqueueAsyncResult(f.root, row("follower"));
      return outcome;
    });
    await runReplLoop(loopDeps(f.root, f.convo, run));
    expect(run).toHaveBeenCalledTimes(2); expect(f.complete).toHaveBeenCalledTimes(2);
    await runReplLoop(loopDeps(f.root, f.convo, run));
    expect(run).toHaveBeenCalledTimes(2);
  });
});
