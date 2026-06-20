import { describe, it, expect } from "vitest";
import {
  isForkSpawn,
  buildForkPreamble,
  resolveSubagentSeed,
  DEFAULT_FORK_CONTEXT_TURNS,
} from "./fork-context.js";
import type { Message } from "../types.js";

const userTurn = (content: string): Message => ({ role: "user", content });
const asstTurn = (content: string): Message => ({ role: "assistant", content });

describe("isForkSpawn", () => {
  it("is a fork when the type is omitted, empty, whitespace, or 'fork'", () => {
    expect(isForkSpawn(undefined)).toBe(true);
    expect(isForkSpawn("")).toBe(true);
    expect(isForkSpawn("   ")).toBe(true);
    expect(isForkSpawn("fork")).toBe(true);
    expect(isForkSpawn("Fork")).toBe(true);
    expect(isForkSpawn("  FORK  ")).toBe(true);
  });

  it("is NOT a fork when a concrete agent type is named", () => {
    expect(isForkSpawn("general-purpose")).toBe(false);
    expect(isForkSpawn("code-reviewer")).toBe(false);
    expect(isForkSpawn("forklift")).toBe(false);
  });
});

describe("buildForkPreamble", () => {
  it("returns an empty string when there is nothing to inherit", () => {
    expect(buildForkPreamble(undefined)).toBe("");
    expect(buildForkPreamble([])).toBe("");
  });

  it("ignores system and tool turns (only user/assistant text is inherited)", () => {
    const msgs: Message[] = [
      { role: "system", content: "you are vanta" },
      { role: "tool", toolCallId: "t1", name: "read_file", content: "file bytes" },
    ];
    expect(buildForkPreamble(msgs)).toBe("");
  });

  it("includes a forked-continuation marker and labeled gist lines", () => {
    const out = buildForkPreamble([userTurn("ship the auth flow"), asstTurn("on it")]);
    expect(out).toContain("[Forked continuation");
    expect(out).toContain("User: ship the auth flow");
    expect(out).toContain("Assistant: on it");
  });

  it("caps to the last N turns and does not dump everything", () => {
    const many: Message[] = Array.from({ length: 20 }, (_, i) => userTurn(`turn ${i}`));
    const out = buildForkPreamble(many, 3);
    const lines = out.split("\n").filter((l) => l.startsWith("User:"));
    expect(lines).toHaveLength(3);
    expect(out).toContain("User: turn 19");
    expect(out).toContain("User: turn 17");
    expect(out).not.toContain("User: turn 16");
  });

  it("defaults the cap to DEFAULT_FORK_CONTEXT_TURNS", () => {
    const many: Message[] = Array.from({ length: 50 }, (_, i) => userTurn(`turn ${i}`));
    const out = buildForkPreamble(many);
    const lines = out.split("\n").filter((l) => l.startsWith("User:"));
    expect(lines).toHaveLength(DEFAULT_FORK_CONTEXT_TURNS);
  });

  it("truncates a long turn to a gist instead of dumping it", () => {
    const huge = "x".repeat(5_000);
    const out = buildForkPreamble([userTurn(huge)]);
    expect(out.length).toBeLessThan(400);
    expect(out).toContain("…");
  });

  it("treats a non-positive or garbage cap as the default", () => {
    const many: Message[] = Array.from({ length: 10 }, (_, i) => userTurn(`turn ${i}`));
    const zero = many.length - buildForkPreamble(many, 0).split("\n").filter((l) => l.startsWith("User:")).length;
    // 0 → default cap (6), so 4 of 10 turns are dropped.
    expect(zero).toBe(10 - DEFAULT_FORK_CONTEXT_TURNS);
    expect(buildForkPreamble(many, Number.NaN).split("\n").filter((l) => l.startsWith("User:"))).toHaveLength(
      DEFAULT_FORK_CONTEXT_TURNS,
    );
  });
});

describe("resolveSubagentSeed", () => {
  const parent: Message[] = [userTurn("refactor the kernel"), asstTurn("done")];

  it("fork (no type): inherits a compact preamble before the instruction", () => {
    const seed = resolveSubagentSeed({
      scopedInstruction: "now add tests",
      parentMessages: parent,
    });
    expect(seed).toContain("[Forked continuation");
    expect(seed).toContain("User: refactor the kernel");
    expect(seed.endsWith("now add tests")).toBe(true);
  });

  it("fork (empty / 'fork' type): also inherits the preamble", () => {
    const opts = { scopedInstruction: "do X", parentMessages: parent };
    expect(resolveSubagentSeed({ ...opts, agentType: "" })).toContain("[Forked continuation");
    expect(resolveSubagentSeed({ ...opts, agentType: "fork" })).toContain("[Forked continuation");
  });

  it("explicit type: scoped instruction only — no preamble (current behavior)", () => {
    const seed = resolveSubagentSeed({
      agentType: "general-purpose",
      scopedInstruction: "do the scoped thing",
      parentMessages: parent,
    });
    expect(seed).toBe("do the scoped thing");
    expect(seed).not.toContain("Forked continuation");
  });

  it("fork with empty parent: just the instruction, no preamble", () => {
    expect(resolveSubagentSeed({ scopedInstruction: "go", parentMessages: [] })).toBe("go");
    expect(resolveSubagentSeed({ scopedInstruction: "go" })).toBe("go");
  });

  it("fork with only non-inheritable parent turns: just the instruction", () => {
    const seed = resolveSubagentSeed({
      scopedInstruction: "go",
      parentMessages: [{ role: "tool", toolCallId: "t", name: "read", content: "bytes" }],
    });
    expect(seed).toBe("go");
  });
});
