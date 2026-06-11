import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldLearn, parseLearned, learnFromTranscript } from "./learn.js";
import { loadEntries } from "./entries.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-learn-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("shouldLearn", () => {
  const on: NodeJS.ProcessEnv = {};
  it("fires on a busy turn or the periodic interval, never turn 0", () => {
    expect(shouldLearn(1, 5, on)).toBe(true);
    expect(shouldLearn(4, 0, on)).toBe(true);
    expect(shouldLearn(0, 0, on)).toBe(false);
    expect(shouldLearn(3, 1, on)).toBe(false);
  });
  it("is fully disabled by VANTA_BRAIN_LEARN=0/off", () => {
    expect(shouldLearn(50, 50, { VANTA_BRAIN_LEARN: "0" })).toBe(false);
    expect(shouldLearn(50, 50, { VANTA_BRAIN_LEARN: "off" })).toBe(false);
  });
  it("honors custom thresholds", () => {
    expect(shouldLearn(1, 2, { VANTA_BRAIN_LEARN_MIN_TOOLS: "2" })).toBe(true);
    expect(shouldLearn(2, 0, { VANTA_BRAIN_LEARN_EVERY: "2" })).toBe(true);
  });
});

describe("parseLearned (pure)", () => {
  it("parses a valid array, dropping invalid regions and capping at 3", () => {
    const out = parseLearned(JSON.stringify([
      { region: "user_model", content: "jason prefers tiny first steps" },
      { region: "not_a_region", content: "should be dropped entirely ok" },
      { region: "semantic", content: "vanta runs fully local on mac" },
      { region: "episodic", content: "shipped the cohesive brain today" },
      { region: "reflections", content: "a fourth one beyond the cap" },
    ]));
    expect(out.map((m) => m.region)).toEqual(["user_model", "semantic", "episodic"]);
  });
  it("tolerates a code fence and returns [] on garbage or non-arrays", () => {
    expect(parseLearned('```json\n[{"region":"semantic","content":"fenced but valid fact"}]\n```')).toHaveLength(1);
    expect(parseLearned("no json here")).toEqual([]);
    expect(parseLearned('{"region":"semantic"}')).toEqual([]);
  });
});

function fakeProvider(text: string): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" }),
  };
}

const transcript: Message[] = [
  { role: "user", content: "i always lose track when steps are too big" },
  { role: "assistant", content: "noted — i'll keep steps tiny and explicit" },
];

describe("learnFromTranscript", () => {
  it("remembers each learned memory with source inference, and they reach the brain", async () => {
    const reply = JSON.stringify([
      { region: "user_model", content: "loses track when steps are too big — keep steps tiny", entry_type: "pattern", confidence: 0.8 },
      { region: "identity", content: "tiny explicit steps land well with this user", entry_type: "insight" },
    ]);
    const learned = await learnFromTranscript({ provider: fakeProvider(reply), transcript });
    expect(learned).toHaveLength(2);
    const entries = await loadEntries();
    expect(entries).toHaveLength(2);
    const pattern = entries.find((e) => e.region === "user_model")!;
    expect(pattern.sourceType).toBe("inference");
    expect(pattern.confidence).toBe(0.8);
    expect(pattern.entryType).toBe("pattern");
    expect(entries.some((e) => e.region === "identity")).toBe(true); // her own personality forms
  });

  it("re-learning the same memory strengthens it instead of duplicating", async () => {
    const reply = JSON.stringify([{ region: "user_model", content: "prefers terse bullet answers" }]);
    await learnFromTranscript({ provider: fakeProvider(reply), transcript });
    await learnFromTranscript({ provider: fakeProvider(reply), transcript });
    const entries = await loadEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strength).toBeCloseTo(0.6); // upsert bump
  });

  it("returns [] and writes nothing on malformed output or provider failure", async () => {
    expect(await learnFromTranscript({ provider: fakeProvider("not json"), transcript })).toEqual([]);
    const failing = { modelId: () => "x", contextWindow: () => 1, complete: async () => { throw new Error("down"); } } as unknown as LLMProvider;
    expect(await learnFromTranscript({ provider: failing, transcript })).toEqual([]);
    expect(await loadEntries()).toEqual([]);
  });

  it("no-ops on an empty transcript", async () => {
    expect(await learnFromTranscript({ provider: fakeProvider("[]"), transcript: [] })).toEqual([]);
  });
});
