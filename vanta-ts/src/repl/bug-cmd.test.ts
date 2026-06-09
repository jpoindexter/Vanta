import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatBugRecord, recentToolNames, bug } from "./bug-cmd.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

describe("formatBugRecord", () => {
  it("renders the description, context lines, and recent tools", () => {
    const out = formatBugRecord({
      description: "model picker didn't persist",
      when: "2026-06-07T10:00:00Z",
      sessionId: "S1",
      provider: "ollama",
      model: "qwen2.5:14b",
      lastIntent: "switch to gemini",
      recentTools: ["read_file", "write_file"],
      git: "feat/x (2 uncommitted files)",
    });
    expect(out).toContain("# Bug: model picker didn't persist");
    expect(out).toContain("ollama/qwen2.5:14b");
    expect(out).toContain("feat/x (2 uncommitted files)");
    expect(out).toContain("- read_file");
    expect(out).toContain("switch to gemini");
  });

  it("handles no recent tools / no intent gracefully", () => {
    const out = formatBugRecord({
      description: "x", when: "t", sessionId: "S", provider: "p", model: "m",
      lastIntent: "", recentTools: [], git: "unknown",
    });
    expect(out).toContain("(none)");
    expect(out).toContain("(none captured)");
  });
});

describe("recentToolNames", () => {
  it("returns the last N tool names oldest→newest", () => {
    const msgs: Message[] = [
      { role: "tool", name: "a", toolCallId: "1", content: "" },
      { role: "user", content: "hi" },
      { role: "tool", name: "b", toolCallId: "2", content: "" },
      { role: "tool", name: "c", toolCallId: "3", content: "" },
    ];
    expect(recentToolNames(msgs, 2)).toEqual(["b", "c"]);
  });
});

describe("/bug handler", () => {
  it("writes a structured record file under .vanta/bugs and returns its path", async () => {
    const dataDir = join(await mkdtemp(join(tmpdir(), "vanta-bug-")), ".vanta");
    const ctx = {
      convo: { messages: [{ role: "user", content: "do the thing" }] as Message[] },
      setup: { provider: { modelId: () => "m" } },
      dataDir,
      state: { sessionId: "S9" },
      env: { VANTA_PROVIDER: "ollama" },
      now: () => new Date("2026-06-07T00:00:00Z"),
    } as unknown as ReplCtx;
    const r = await bug("it broke when I clicked save", ctx);
    expect(r.output).toContain("bug recorded");
    const files = await readdir(join(dataDir, "bugs"));
    expect(files.length).toBe(1);
    const body = await readFile(join(dataDir, "bugs", files[0]!), "utf8");
    expect(body).toContain("it broke when I clicked save");
    expect(body).toContain("Session: S9");
  });

  it("rejects an empty description", async () => {
    const r = await bug("   ", {} as ReplCtx);
    expect(r.output).toContain("usage");
  });
});
