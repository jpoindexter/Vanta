import { describe, it, expect } from "vitest";
import { compileTriggersForCodex, mergeAgentsMd, CODEX_BLOCK_START } from "./triggers-codex.js";
import type { Skill, SkillTrigger } from "./types.js";

const skill = (triggers: SkillTrigger[]): Skill =>
  ({ meta: { name: "ideation-methods", description: "22-method ideation routing", triggers } } as unknown as Skill);

describe("compileTriggersForCodex — AGENTS.md routing for the hookless Codex CLI", () => {
  it("emits a routing line for a UserPromptSubmit trigger (Codex acts on prompt intent)", () => {
    const line = compileTriggersForCodex(skill([{ event: "UserPromptSubmit", match: "ideat|brainstorm" }]));
    expect(line).toContain("ideation-methods");
    expect(line).toContain("ideat|brainstorm");
    expect(line).toContain("22-method ideation routing");
  });
  it("returns null when there's no prompt-level trigger — Codex has no event hooks", () => {
    expect(compileTriggersForCodex(skill([{ event: "PostToolUse", when: "errors>=3" }]))).toBeNull();
    expect(compileTriggersForCodex(skill([]))).toBeNull();
  });
});

describe("mergeAgentsMd — idempotent marked block", () => {
  it("inserts the routing block while preserving existing AGENTS.md content", () => {
    const out = mergeAgentsMd("# My project\n\nHouse rules.", ["- **x** — apply x."]);
    expect(out).toContain("# My project");
    expect(out).toContain("House rules.");
    expect(out).toContain("- **x** — apply x.");
    expect(out).toContain(CODEX_BLOCK_START);
  });
  it("replaces the block on re-sync — idempotent, no duplication", () => {
    const once = mergeAgentsMd("# P", ["- **a** — a."]);
    const twice = mergeAgentsMd(once, ["- **b** — b."]);
    expect(twice).toContain("- **b** — b.");
    expect(twice).not.toContain("- **a** — a.");
    expect((twice.match(/vanta:skill-triggers:start/g) || []).length).toBe(1);
  });
  it("removes the block entirely when there are no routing lines", () => {
    const withBlock = mergeAgentsMd("# P", ["- **a** — a."]);
    const cleared = mergeAgentsMd(withBlock, []);
    expect(cleared).not.toContain(CODEX_BLOCK_START);
    expect(cleared).toContain("# P");
  });
});
