import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  shouldUpdateSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  clearSessionMemory,
  serializeForNotes,
  sessionMemoryBlock,
  sessionMemoryPath,
  updateSessionMemory,
} from "./session-memory.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";

describe("shouldUpdateSessionMemory", () => {
  const on: NodeJS.ProcessEnv = {};

  it("fires on a busy turn (>= min tools)", () => {
    expect(shouldUpdateSessionMemory(1, 5, on)).toBe(true);
  });

  it("fires periodically on the interval turn", () => {
    expect(shouldUpdateSessionMemory(3, 0, on)).toBe(true);
    expect(shouldUpdateSessionMemory(6, 0, on)).toBe(true);
  });

  it("stays quiet on a light, off-interval turn", () => {
    expect(shouldUpdateSessionMemory(1, 1, on)).toBe(false);
    expect(shouldUpdateSessionMemory(2, 2, on)).toBe(false);
  });

  it("never fires on turn 0", () => {
    expect(shouldUpdateSessionMemory(0, 0, on)).toBe(false);
  });

  it("is fully disabled by VANTA_SESSION_MEMORY=0/false/off/no", () => {
    for (const v of ["0", "false", "off", "no"]) {
      expect(shouldUpdateSessionMemory(50, 50, { VANTA_SESSION_MEMORY: v })).toBe(false);
    }
  });

  it("honors custom thresholds", () => {
    expect(shouldUpdateSessionMemory(1, 3, { VANTA_SESSION_MEMORY_MIN_TOOLS: "3" })).toBe(true);
    expect(shouldUpdateSessionMemory(5, 0, { VANTA_SESSION_MEMORY_EVERY: "5" })).toBe(true);
    expect(shouldUpdateSessionMemory(4, 0, { VANTA_SESSION_MEMORY_EVERY: "5" })).toBe(false);
  });
});

describe("read/write/clear session memory", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-sm-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns empty string when no scratchpad exists", async () => {
    expect(await readSessionMemory(dir)).toBe("");
  });

  it("round-trips written content and creates the dir if missing", async () => {
    const nested = join(dir, "deep", ".vanta");
    await writeSessionMemory(nested, "- **Goal** ship card 1");
    expect(await readSessionMemory(nested)).toBe("- **Goal** ship card 1");
    expect(sessionMemoryPath(nested)).toBe(join(nested, "session-memory.md"));
  });

  it("clear removes the file and is idempotent on a missing file", async () => {
    await writeSessionMemory(dir, "notes");
    await clearSessionMemory(dir);
    expect(await readSessionMemory(dir)).toBe("");
    await clearSessionMemory(dir); // no throw
  });
});

describe("serializeForNotes", () => {
  it("formats each role and lists assistant tool calls", () => {
    const msgs: Message[] = [
      { role: "system", content: "rules" },
      { role: "user", content: "do the thing" },
      { role: "assistant", content: "on it", toolCalls: [{ id: "1", name: "read_file", arguments: {} }] },
      { role: "tool", toolCallId: "1", name: "read_file", content: "file body" },
    ];
    const out = serializeForNotes(msgs);
    expect(out).not.toContain("rules"); // system dropped
    expect(out).toContain("USER: do the thing");
    expect(out).toContain("ASSISTANT: on it [called: read_file]");
    expect(out).toContain("TOOL(read_file): file body");
  });

  it("caps to the tail when over the char budget", () => {
    const msgs: Message[] = Array.from({ length: 200 }, (_, i) => ({ role: "user" as const, content: `line ${i} ${"x".repeat(50)}` }));
    const out = serializeForNotes(msgs, 500);
    expect(out.length).toBeLessThanOrEqual(504); // 500 + "...\n"
    expect(out.startsWith("...")).toBe(true);
    expect(out).toContain("line 199"); // newest survives
  });
});

describe("sessionMemoryBlock", () => {
  it("frames the notes as a resume scratchpad", () => {
    const block = sessionMemoryBlock("- Goal: x");
    expect(block).toContain("Session scratchpad");
    expect(block).toContain("- Goal: x");
  });
});

/** A provider that echoes a canned completion text. */
function fakeProvider(text: string): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" }),
  };
}

describe("updateSessionMemory", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-sm-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const transcript: Message[] = [
    { role: "user", content: "build the session memory card" },
    { role: "assistant", content: "wired the distiller and injection" },
  ];

  it("distils the transcript, writes the file, and returns the content", async () => {
    const notes = "- **Goal** ship session memory\n- **Now** writing tests";
    const r = await updateSessionMemory({ provider: fakeProvider(notes), dataDir: dir, transcript });
    expect(r.updated).toBe(true);
    expect(r.content).toBe(notes);
    expect(await readSessionMemory(dir)).toBe(notes);
  });

  it("strips a wrapping markdown code fence", async () => {
    const fenced = "```markdown\n- **Goal** x\n```";
    const r = await updateSessionMemory({ provider: fakeProvider(fenced), dataDir: dir, transcript });
    expect(r.content).toBe("- **Goal** x");
    expect(await readSessionMemory(dir)).toBe("- **Goal** x");
  });

  it("passes the existing notes to the model so it updates in place", async () => {
    await writeSessionMemory(dir, "PRIOR NOTES");
    let seenUser = "";
    const spy: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: async (messages): Promise<CompletionResult> => {
        seenUser = (messages.find((m) => m.role === "user")?.content as string) ?? "";
        return { text: "- updated", toolCalls: [], finishReason: "stop" };
      },
    };
    await updateSessionMemory({ provider: spy, dataDir: dir, transcript });
    expect(seenUser).toContain("PRIOR NOTES");
  });

  it("no-ops on an empty transcript", async () => {
    const r = await updateSessionMemory({ provider: fakeProvider("ignored"), dataDir: dir, transcript: [] });
    expect(r.updated).toBe(false);
    expect(await readSessionMemory(dir)).toBe("");
  });

  it("swallows provider failure (best-effort) and writes nothing", async () => {
    const failing = {
      modelId: () => "x",
      contextWindow: () => 1000,
      complete: async () => { throw new Error("provider down"); },
    } as unknown as LLMProvider;
    const r = await updateSessionMemory({ provider: failing, dataDir: dir, transcript });
    expect(r.updated).toBe(false);
    expect(await readSessionMemory(dir)).toBe("");
  });

  it("does not overwrite the prior scratchpad when the model returns only whitespace", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(sessionMemoryPath(dir), "KEEP ME", "utf8");
    const r = await updateSessionMemory({ provider: fakeProvider("   \n  "), dataDir: dir, transcript });
    expect(r.updated).toBe(false);
    expect(await readFile(sessionMemoryPath(dir), "utf8")).toBe("KEEP ME");
  });
});
