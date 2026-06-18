import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDistillPrompt, distilledFromText, distillSavings, distillSkill,
  readDistilled, writeDistilled, distilledEnabled,
} from "./distill.js";
import { writeSkill } from "./store.js";
import { recallTool } from "../tools/recall.js";
import type { LLMProvider } from "../providers/interface.js";

function fakeProvider(reply: string): LLMProvider {
  return {
    complete: async () => ({ text: reply }),
    modelId: () => "fake",
    contextWindow: () => 8000,
  } as unknown as LLMProvider;
}

describe("distill pure helpers", () => {
  it("buildDistillPrompt carries the skill name, N, and body", () => {
    const p = buildDistillPrompt("deploy", "long procedure here", 3);
    expect(p).toContain("deploy");
    expect(p).toContain("N = 3");
    expect(p).toContain("long procedure here");
  });

  it("distilledFromText rejects empty/too-short, accepts real content", () => {
    expect(distilledFromText("  ")).toBeNull();
    expect(distilledFromText("## Examples\n1. Input: x / Output: y")).toBeTruthy();
  });

  it("distillSavings reports a token reduction", () => {
    const full = "step ".repeat(400);
    const s = distillSavings(full, "## Examples\n1. do x");
    expect(s.saved).toBeGreaterThan(0);
    expect(s.ratio).toBeGreaterThan(0.5);
  });

  it("distilledEnabled reads the opt-in env", () => {
    expect(distilledEnabled({ VANTA_SKILL_DISTILLED: "1" })).toBe(true);
    expect(distilledEnabled({})).toBe(false);
  });
});

describe("distill + serve (isolated home)", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-distill-")); prev = process.env.VANTA_HOME; process.env.VANTA_HOME = home; });
  afterEach(async () => { if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev; delete process.env.VANTA_SKILL_DISTILLED; await rm(home, { recursive: true, force: true }); });

  it("distillSkill writes worked examples next to the skill and returns them", async () => {
    const out = await distillSkill({ name: "Deploy Flow", body: "a long procedural skill body ".repeat(20), provider: fakeProvider("## Examples\n1. Input: ship → Approach: run preflight → Output: deployed") });
    expect(out).toContain("## Examples");
    expect(await readDistilled("Deploy Flow")).toBe(out);
  });

  it("writeDistilled/readDistilled round-trip", async () => {
    await writeDistilled("My Skill", "## Examples\n1. x");
    expect(await readDistilled("My Skill")).toBe("## Examples\n1. x");
  });

  it("recall serves the distilled form when enabled, full body otherwise", async () => {
    const body = "FULL PROCEDURAL BODY: do the very long thing in many steps. ".repeat(10);
    await writeSkill({ name: "Widget", description: "make widgets", body }, { env: process.env });
    await writeDistilled("Widget", "## Examples\n1. Input: a → Output: b");

    const ctx = { root: "/", safety: null as never, requestApproval: async () => true };
    // opt-in off → full body
    const full = await recallTool.execute({ query: "widget" }, ctx);
    expect(full.output).toContain("FULL PROCEDURAL BODY");

    // opt-in on → distilled form
    process.env.VANTA_SKILL_DISTILLED = "1";
    const distilled = await recallTool.execute({ query: "widget" }, ctx);
    expect(distilled.output).toContain("## Examples");
    expect(distilled.output).not.toContain("FULL PROCEDURAL BODY");
  });
});
