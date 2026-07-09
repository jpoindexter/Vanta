import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import { addBeliefToStore, evidence, loadBeliefStore, saveBeliefStore, type BeliefStore } from "./beliefs.js";
import { applyDialecticUpdates, parseDialecticUpdates, runDialecticPass, shouldRunDialectic } from "./dialectic.js";

let home: string;
const NOW = new Date("2026-07-10T12:00:00.000Z");

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-dialectic-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { VANTA_HOME: home, ...extra };
}

function provider(text: string): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" }),
  };
}

function transcript(user: string): Message[] {
  return [{ role: "user", content: user }, { role: "assistant", content: "Understood." }];
}

describe("dialectic gate and parser", () => {
  it("runs for direct preferences, corrections, or the periodic interval", () => {
    expect(shouldRunDialectic(1, "I prefer concise answers", {})).toBe(true);
    expect(shouldRunDialectic(1, "No, that is wrong, don't do that", {})).toBe(true);
    expect(shouldRunDialectic(8, "Thanks", {})).toBe(true);
    expect(shouldRunDialectic(7, "Thanks", {})).toBe(false);
    expect(shouldRunDialectic(8, "I prefer concise answers", { VANTA_DIALECTIC: "off" })).toBe(false);
    expect(shouldRunDialectic(8, "my password=hunter2", {})).toBe(false);
  });

  it("accepts only the bounded structured update array", () => {
    const valid = parseDialecticUpdates(JSON.stringify([{
      operation: "form",
      statement: "The user prefers concise answers",
      facet: "communication",
      confidence: 0.7,
      evidence_quote: "concise answers",
    }]));
    expect(valid).toHaveLength(1);
    expect(parseDialecticUpdates("not json")).toEqual([]);
    expect(parseDialecticUpdates(JSON.stringify([{ operation: "delete_everything" }]))).toEqual([]);
  });
});

describe("dialectic lifecycle", () => {
  it("captures a direct user preference as accepted without asking the model", async () => {
    let calls = 0;
    const fake = provider("[]");
    fake.complete = async () => { calls++; return { text: "[]", toolCalls: [], finishReason: "stop" }; };
    const result = await runDialecticPass({
      provider: fake,
      transcript: transcript("I prefer concise answers"),
      sessionId: "s1",
      turnIndex: 2,
      env: env(),
      now: NOW,
    });
    const store = await loadBeliefStore(env());
    expect(result.reason).toBe("self-report");
    expect(calls).toBe(0);
    expect(store.beliefs[0]?.status).toBe("accepted");
    expect(store.beliefs[0]?.evidence[0]?.sourceRef).toBe("session:s1:turn:2");
  });

  it("forms a bounded hypothesis from an exact user quote on a periodic pass", async () => {
    const reply = JSON.stringify([{
      operation: "form",
      statement: "The user may prefer visual summaries",
      facet: "communication",
      confidence: 0.95,
      evidence_quote: "show me a diagram",
    }]);
    await runDialecticPass({
      provider: provider(reply),
      transcript: transcript("Thanks, show me a diagram for this one"),
      sessionId: "s2",
      turnIndex: 8,
      env: env(),
      now: NOW,
    });
    const belief = (await loadBeliefStore(env())).beliefs[0];
    expect(belief?.status).toBe("hypothesis");
    expect(belief?.confidence).toBe(0.75);
    expect(belief?.evidence[0]?.kind).toBe("dialectic");
  });

  it("lets a direct correction revise an accepted belief and keeps the old claim", () => {
    const store: BeliefStore = { version: 1, beliefs: [] };
    addBeliefToStore(store, {
      statement: "The user prefers detailed answers",
      facet: "communication",
      status: "accepted",
      confidence: 1,
      evidence: evidence({ kind: "self_report", sourceRef: "session:old:turn:1", excerpt: "I prefer detailed answers" }, NOW),
    }, { now: NOW, id: () => "old" });
    const updates = parseDialecticUpdates(JSON.stringify([{
      operation: "revise",
      belief_id: "old",
      statement: "The user prefers concise answers",
      facet: "communication",
      confidence: 0.9,
      evidence_quote: "No, keep answers concise",
    }]));
    const changed = applyDialecticUpdates(store, updates, {
      userText: "No, keep answers concise, that is wrong",
      sourceRef: "session:new:turn:1",
      now: new Date("2026-07-10T13:00:00.000Z"),
    });
    expect(changed[0]?.status).toBe("accepted");
    expect(store.beliefs.find((belief) => belief.id === "old")?.status).toBe("superseded");
    expect(changed[0]?.revisionOf).toBe("old");
  });

  it("does not let an observational inference rewrite an accepted self-report", async () => {
    const store: BeliefStore = { version: 1, beliefs: [] };
    addBeliefToStore(store, {
      statement: "The user prefers concise answers",
      facet: "communication",
      status: "accepted",
      confidence: 1,
      evidence: evidence({ kind: "self_report", sourceRef: "session:s1:turn:1", excerpt: "I prefer concise answers" }, NOW),
    }, { now: NOW, id: () => "accepted" });
    await saveBeliefStore(store, env());
    const reply = JSON.stringify([{
      operation: "revise",
      belief_id: "accepted",
      statement: "The user prefers detailed answers",
      facet: "communication",
      confidence: 0.8,
      evidence_quote: "explain that in detail",
    }]);
    await runDialecticPass({
      provider: provider(reply),
      transcript: transcript("Please explain that in detail this time"),
      sessionId: "s2",
      turnIndex: 8,
      env: env(),
      now: NOW,
    });
    const loaded = await loadBeliefStore(env());
    expect(loaded.beliefs).toHaveLength(1);
    expect(loaded.beliefs[0]?.status).toBe("accepted");
  });
});
