import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remember } from "../brain/brain.js";
import { loadEntries } from "../brain/entries.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import { runMemoryExtractor } from "./extractor.js";

let home: string;
const prevHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-extractor-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prevHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prevHome;
  await rm(home, { recursive: true, force: true });
});

function fakeProvider(text: string): LLMProvider {
  return {
    modelId: () => "fake-cheap",
    contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" }),
  };
}

const turnWindow: Message[] = [
  { role: "user", content: "I prefer terse status updates." },
  { role: "assistant", content: "I will keep status updates terse." },
  { role: "user", content: "Vanta's memory extractor is opt-in only." },
  { role: "assistant", content: "I'll remember durable facts only when enabled." },
];

describe("runMemoryExtractor", () => {
  it("no-ops when VANTA_EXTRACT_MEMORIES is not enabled", async () => {
    const out = await runMemoryExtractor(turnWindow, { provider: fakeProvider("[\"fact\"]"), env: {} });
    expect(out).toEqual({ extracted: [], stored: 0 });
    expect(await loadEntries()).toEqual([]);
  });

  it("returns empty output on JSON parse failure without throwing", async () => {
    const out = await runMemoryExtractor(turnWindow, {
      provider: fakeProvider("not json"),
      env: { VANTA_EXTRACT_MEMORIES: "1" },
    });
    expect(out).toEqual({ extracted: [], stored: 0 });
    expect(await loadEntries()).toEqual([]);
  });

  it("skips candidate facts with at least 80 percent word overlap", async () => {
    await remember({
      region: "semantic",
      content: "The user prefers terse status updates",
      sourceType: "inference",
    });
    const out = await runMemoryExtractor(turnWindow, {
      provider: fakeProvider(JSON.stringify(["User prefers terse status updates"])),
      env: { VANTA_EXTRACT_MEMORIES: "1" },
    });
    expect(out).toEqual({ extracted: ["User prefers terse status updates"], stored: 0 });
    expect(await loadEntries()).toHaveLength(1);
  });

  it("stores two new facts in the brain with auto-extracted provenance", async () => {
    const now = new Date("2026-06-15T10:11:12.000Z");
    const out = await runMemoryExtractor(turnWindow, {
      provider: fakeProvider(JSON.stringify([
        "The user prefers terse status updates",
        "Vanta's memory extractor is opt-in only",
      ])),
      env: { VANTA_EXTRACT_MEMORIES: "1" },
      now,
    });
    expect(out).toEqual({
      extracted: [
        "The user prefers terse status updates",
        "Vanta's memory extractor is opt-in only",
      ],
      stored: 2,
    });
    const entries = await loadEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.sourceRef)).toEqual(["auto-extracted", "auto-extracted"]);
    expect(entries.map((e) => e.createdAt)).toEqual([now.toISOString(), now.toISOString()]);
  });
});
