import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConversation } from "../agent.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { ToolResult } from "../tools/types.js";
import { makeInitialState, recordToolOutcome } from "./turn-state.js";
import type { Message } from "../types.js";
import { persistCompaction } from "./context-pipeline.js";
import { toolPairingViolation } from "./tool-pairing.js";
import { buildOperatorSpine, formatOperatorSpine } from "../work-items/operator-spine.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const usage = { inputTokens: 100, outputTokens: 10 };
const toolCall = { id: "effect-one", name: "fixture", arguments: {} };
const answer: CompletionResult = { text: "Ordinary answer.", toolCalls: [], finishReason: "stop", usage };

async function fixture(result?: ToolResult, sessionId?: string) {
  vi.stubEnv("VANTA_AUTOCONTINUE", "0");
  const root = await mkdtemp(join(tmpdir(), "vanta-effect-review-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  const registry = new InMemoryToolRegistry();
  const execute = vi.fn(async () => result ?? { ok: true, output: "Read completed", effectDisposition: "confirmed" as const });
  registry.register({ schema: { name: "fixture", description: "private fixture", parameters: { type: "object", properties: {} } }, execute });
  const complete = vi.fn<LLMProvider["complete"]>().mockResolvedValue(answer);
  if (result) complete.mockResolvedValueOnce({ text: "Preparing the action.", toolCalls: [toolCall], finishReason: "tool_calls", usage });
  const deps: AgentDeps = { provider: { modelId: () => "fixture", contextWindow: () => 100_000, complete },
    registry, root, sessionId, safety: { assess: async () => ({ risk: "allow", reason: "private fixture" }), logEvent: async () => {} } as unknown as AgentDeps["safety"], requestApproval: async () => false };
  return { root, convo: createConversation("test", deps), complete, execute };
}

describe("unknown-effect turn settlement", () => {
  it("carries uncertainty into one actionable canonical attention item without copying the body", async () => {
    const f = await fixture({ ok: false, output: "Private body must not enter receipts", effectDisposition: "unknown" }, "review-session");
    await f.convo.send("Handle the action");
    const snapshot = await buildOperatorSpine(f.root);
    expect(snapshot.views.needsYou).toHaveLength(1);
    const record = snapshot.views.needsYou[0]!;
    expect(record.item).toMatchObject({ outcome: "Check whether the action completed", blocker: "The provider did not confirm whether the action completed." });
    expect(record.item.nextAction).toContain("Do not retry");
    expect(record.item.artifacts).toContainEqual({ kind: "file", ref: join(f.root, ".vanta/action-receipts.jsonl") });
    expect(snapshot.receipts.find(row => record.related.receiptIds.includes(row.id))?.disposition).toBe("unknown");
    expect(JSON.stringify(record)).not.toContain("Private body");
    const shown = formatOperatorSpine(snapshot);
    expect(shown).toContain("Check whether the action completed");
    expect(shown).toContain("Do not retry");
    expect(shown).toContain(record.source.id);
  });

  it("stops as blocked/needs-human with usage and no next model call", async () => {
    const f = await fixture({ ok: false, output: "Partial action; do not retry", effectDisposition: "unknown" });
    const outcome = await f.convo.send("Handle the action");
    expect(outcome).toMatchObject({ stoppedReason: "blocked", completionState: "needs human", needsEffectReview: true, usage });
    expect(f.complete).toHaveBeenCalledOnce();
    expect(f.convo.messages.some(message => message.content === "Preparing the action.")).toBe(true);
    expect(f.convo.messages.some(message => message.role === "tool" && message.effectDisposition === "unknown")).toBe(true);
  });

  it("does not turn ordinary unverified chat or successful reads into failures", async () => {
    const ordinary = await fixture();
    expect(await ordinary.convo.send("Hello")).toMatchObject({ stoppedReason: "done", completionState: "unverified" });
    const read = await fixture({ ok: true, output: "Read result", effectDisposition: "confirmed" });
    expect(await read.convo.send("Read the information")).toMatchObject({ stoppedReason: "done", completionState: "unverified" });
  });

  it("resets the marker for a new turn despite retained historical unknown messages", async () => {
    const f = await fixture({ ok: false, output: "Uncertain", effectDisposition: "unknown" });
    expect(await f.convo.send("Handle action")).toMatchObject({ needsEffectReview: true });
    const next = await f.convo.send("Explain a different concept");
    expect(next.stoppedReason).toBe("done");
    expect(next).not.toHaveProperty("needsEffectReview");
  });

  it("does not dispatch a later tool in the same returned batch", async () => {
    const f = await fixture({ ok: false, output: "Uncertain", effectDisposition: "unknown" });
    f.complete.mockReset().mockResolvedValueOnce({ ...answer, toolCalls: [toolCall, { ...toolCall, id: "must-not-run" }] }).mockResolvedValue(answer);
    expect(await f.convo.send("Handle actions")).toMatchObject({ stoppedReason: "blocked", needsEffectReview: true });
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.convo.messages.filter(message => message.role === "tool")).toHaveLength(2);
  });
});

it("keeps turn-owned uncertainty through actual persistent transcript compaction", async () => {
  const f = await fixture();
  vi.stubEnv("VANTA_AUTO_COMPACT_THRESHOLD", "0.1");
  const state = makeInitialState();
  recordToolOutcome(state, toolCall, { executed: true, empty: false, ok: false, output: "uncertain", effectDisposition: "unknown", workItemState: "unverified" }, {} as AgentDeps);
  const messages: Message[] = [{ role: "system", content: "test" }, ...Array.from({ length: 32 }, (_, index): Message => ({ role: index % 2 ? "assistant" : "user", content: "Earlier conversation. ".repeat(100) }))];
  const compacted = vi.fn();
  await persistCompaction(messages, { root: f.root, provider: { modelId: () => "fixture", contextWindow: () => 1000, complete: f.complete },
    summarize: async () => "Compacted summary without effect details", onAutoCompact: compacted });
  expect(compacted).toHaveBeenCalled();
  expect(messages.length).toBeLessThan(33);
  expect(state).toHaveProperty("needsEffectReview", true);
  expect(makeInitialState()).toHaveProperty("needsEffectReview", false);
});

it("retains uncertainty if post-effect persistence fails instead of producing a retry-safe error", async () => {
  const f = await fixture({ ok: false, output: "Uncertain", effectDisposition: "unknown" });
  f.complete.mockReset().mockResolvedValueOnce({ ...answer, toolCalls: [toolCall, { ...toolCall, id: "unstarted-sibling" }] });
  const persistence = await import("./effect-persistence.js");
  vi.spyOn(persistence, "persistEffectTransition").mockImplementation(async (_root, _session, _call, transition) => {
    if (transition === "settled") throw new Error("private checkpoint failure");
  });
  expect(await f.convo.send("Handle the action")).toMatchObject({ stoppedReason: "blocked", needsEffectReview: true, completionState: "needs human", usage });
  expect(f.execute).toHaveBeenCalledOnce();
  expect(toolPairingViolation(f.convo.messages)).toBeNull();
});
