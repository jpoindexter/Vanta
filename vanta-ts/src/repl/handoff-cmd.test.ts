import { describe, it, expect } from "vitest";
import { formatHandoffPacket } from "./handoff-cmd.js";
import type { Goal } from "../types.js";

const base = {
  when: "2026-06-07T10:00:00Z",
  sessionId: "S1",
  provider: "ollama",
  model: "qwen2.5:14b",
  branch: "feat/x",
  changedFiles: " M src/a.ts\n?? src/b.ts",
  goals: [{ id: 1, text: "ship the thing", status: "active" }] as Goal[],
  lastIntent: "fix the bug",
  lastResult: "Done — 3 tests pass.",
  recentTools: ["read_file", "write_file"],
};

describe("formatHandoffPacket", () => {
  it("includes goals, branch, changed files, tools, intent, and a next-action slot", () => {
    const out = formatHandoffPacket(base);
    expect(out).toContain("HANDOFF — 2026-06-07");
    expect(out).toContain("feat/x");
    expect(out).toContain("ship the thing");
    expect(out).toContain("src/a.ts");
    expect(out).toContain("read_file, write_file");
    expect(out).toContain("fix the bug");
    expect(out).toContain("NEXT ACTION");
  });

  it("renders (clean) and (none) when state is empty", () => {
    const out = formatHandoffPacket({ ...base, changedFiles: "", goals: [], recentTools: [], lastIntent: "", lastResult: "" });
    expect(out).toContain("(clean)");
    expect(out).toContain("(none)");
  });

  it("only lists active goals", () => {
    const out = formatHandoffPacket({
      ...base,
      goals: [
        { id: 1, text: "active one", status: "active" },
        { id: 2, text: "done one", status: "completed" },
      ] as Goal[],
    });
    expect(out).toContain("active one");
    expect(out).not.toContain("done one");
  });
});
