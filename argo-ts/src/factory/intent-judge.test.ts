import { describe, it, expect } from "vitest";
import { parseJudgeResponse, checkIntentSatisfied } from "./intent-judge.js";
import type { LLMProvider } from "../providers/interface.js";
import type { WorkItem } from "./types.js";

// Minimal fake provider for testing
function fakeProvider(responseText: string): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 8000,
    complete: async () => ({ text: responseText, toolCalls: [], finishReason: "stop" }),
  };
}

function failingProvider(msg = "network error"): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 8000,
    complete: async () => { throw new Error(msg); },
  };
}

const ITEM: WorkItem = { category: "roadmap", description: "Add a write_file diff view to the TUI" };

describe("parseJudgeResponse", () => {
  it("parses a valid satisfied response", () => {
    const r = parseJudgeResponse('{"satisfied": true, "reason": "changes match the goal"}');
    expect(r).toEqual({ satisfied: true, reason: "changes match the goal" });
  });

  it("parses a rejection response", () => {
    const r = parseJudgeResponse('{"satisfied": false, "reason": "changes are unrelated"}');
    expect(r?.satisfied).toBe(false);
    expect(r?.reason).toContain("unrelated");
  });

  it("extracts JSON from a string with preamble", () => {
    const r = parseJudgeResponse('Here is my verdict: {"satisfied": true, "reason": "looks good"}');
    expect(r?.satisfied).toBe(true);
  });

  it("returns null for non-JSON text", () => {
    expect(parseJudgeResponse("yes, it satisfies")).toBeNull();
  });

  it("returns null when satisfied field is missing", () => {
    expect(parseJudgeResponse('{"reason": "ok"}')).toBeNull();
  });

  it("returns null when satisfied is not boolean", () => {
    expect(parseJudgeResponse('{"satisfied": "yes", "reason": "ok"}')).toBeNull();
  });
});

describe("checkIntentSatisfied", () => {
  it("returns ok:true when judge says satisfied", async () => {
    const p = fakeProvider('{"satisfied": true, "reason": "directly addresses goal"}');
    const r = await checkIntentSatisfied(ITEM, ["src/tui/diff.ts"], p);
    expect(r.ok).toBe(true);
  });

  it("returns ok:false when judge rejects", async () => {
    const p = fakeProvider('{"satisfied": false, "reason": "changed unrelated config files"}');
    const r = await checkIntentSatisfied(ITEM, ["argo-ts/.env"], p);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/intent not satisfied/i);
  });

  it("fails open (ok:true) when provider throws", async () => {
    const r = await checkIntentSatisfied(ITEM, ["src/foo.ts"], failingProvider());
    expect(r.ok).toBe(true);
  });

  it("fails open (ok:true) when response is malformed", async () => {
    const r = await checkIntentSatisfied(ITEM, ["src/foo.ts"], fakeProvider("not json at all"));
    expect(r.ok).toBe(true);
  });

  it("returns ok:false immediately when no files were changed", async () => {
    const r = await checkIntentSatisfied(ITEM, [], fakeProvider("{}"));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no files");
  });
});
