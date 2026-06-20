import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveSessionMemoryCompact,
  extractDiscoveredToolNames,
  mergeToolsLine,
  compactToSessionMemory,
} from "./session-memory-compact.js";
import type { Message } from "../types.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";

class NotesProvider implements LLMProvider {
  constructor(private readonly text: string) {}
  async complete(): Promise<CompletionResult> {
    return { text: this.text, toolCalls: [], finishReason: "stop" };
  }
  modelId() { return "fake-notes"; }
  contextWindow() { return 8192; }
}

class ThrowingProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    throw new Error("no llm available");
  }
  modelId() { return "boom"; }
  contextWindow() { return 8192; }
}

const WINDOW: Message[] = [
  { role: "user", content: "fix the parser" },
  { role: "assistant", content: "on it", toolCalls: [{ id: "1", name: "read_file", arguments: {} }, { id: "2", name: "shell_cmd", arguments: {} }] },
  { role: "tool", toolCallId: "1", name: "read_file", content: "...file..." },
];

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "vanta-smc-")); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe("resolveSessionMemoryCompact", () => {
  it("is off by default and on when armed", () => {
    expect(resolveSessionMemoryCompact({})).toBe(false);
    expect(resolveSessionMemoryCompact({ VANTA_SESSION_MEMORY_COMPACT: "0" })).toBe(false);
    expect(resolveSessionMemoryCompact({ VANTA_SESSION_MEMORY_COMPACT: "1" })).toBe(true);
    expect(resolveSessionMemoryCompact({ VANTA_SESSION_MEMORY_COMPACT: "true" })).toBe(true);
    expect(resolveSessionMemoryCompact({ VANTA_SESSION_MEMORY_COMPACT: "on" })).toBe(true);
  });
});

describe("extractDiscoveredToolNames", () => {
  it("returns unique sorted tool names across calls + results", () => {
    expect(extractDiscoveredToolNames(WINDOW)).toEqual(["read_file", "shell_cmd"]);
  });
  it("returns empty for a window with no tools", () => {
    expect(extractDiscoveredToolNames([{ role: "user", content: "hi" }])).toEqual([]);
  });
});

describe("mergeToolsLine", () => {
  it("appends a tools line to existing notes", () => {
    const r = mergeToolsLine("**Goal**\n- ship X", ["a", "b"]);
    expect(r).toContain("**Goal**");
    expect(r).toContain("**Tools seen**: a, b");
  });
  it("accumulates with prior tools, deduped and sorted", () => {
    const first = mergeToolsLine("- note", ["read_file"]);
    const second = mergeToolsLine(first, ["shell_cmd", "read_file"]);
    expect(second).toContain("**Tools seen**: read_file, shell_cmd");
    // only one tools line, not duplicated
    expect(second.match(/\*\*Tools seen\*\*:/g)?.length).toBe(1);
  });
});

describe("compactToSessionMemory", () => {
  it("persists distilled notes + discovered tools to the session-memory file (resume round-trip)", async () => {
    const r = await compactToSessionMemory({
      provider: new NotesProvider("**Goal**\n- ship the parser fix\n**Decisions**\n- chose recursive descent"),
      dataDir: tmp,
      window: WINDOW,
    });
    expect(r.persisted).toBe(true);
    const file = await readFile(join(tmp, "session-memory.md"), "utf8");
    expect(file).toContain("ship the parser fix");
    expect(file).toContain("recursive descent");
    expect(file).toContain("**Tools seen**: read_file, shell_cmd");
  });

  it("still records discovered tools when the distiller LLM fails (best-effort)", async () => {
    const r = await compactToSessionMemory({
      provider: new ThrowingProvider(),
      dataDir: tmp,
      window: WINDOW,
    });
    expect(r.persisted).toBe(true);
    const file = await readFile(join(tmp, "session-memory.md"), "utf8");
    expect(file).toContain("**Tools seen**: read_file, shell_cmd");
  });
});
