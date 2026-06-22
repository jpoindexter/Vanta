import { describe, it, expect } from "vitest";
import { runLearningCycle, formatCycleNote, type LearningDeps, type Proposed } from "./loop.js";
import { gateSkill } from "./eval-gate.js";
import type { LearningEvent } from "./ledger.js";
import type { Skill } from "../skills/types.js";

const mkSkill = (name: string, body: string): Skill => ({
  meta: { name, description: `desc ${name}`, created: "", updated: "", tags: ["vanta-learned"] },
  body,
});

const GOOD = "Run the single failing file, read the assertion, fix the cause, re-run to confirm.";

/** Build deps over an in-memory skill set, capturing archives + ledger writes. */
function deps(over: {
  proposed: Proposed[];
  skills: Record<string, Skill>;
  handAuthored?: Set<string>;
}): { d: LearningDeps; archived: string[]; recorded: LearningEvent[] } {
  const archived: string[] = [];
  const recorded: LearningEvent[] = [];
  const d: LearningDeps = {
    propose: async () => over.proposed,
    load: async (name) => over.skills[name] ?? null,
    handAuthored: async () => over.handAuthored ?? new Set<string>(),
    gate: gateSkill,
    archive: async (name) => {
      archived.push(name);
      return true;
    },
    record: async (e) => {
      recorded.push(e);
    },
    now: () => new Date("2026-06-22T00:00:00Z"),
  };
  return { d, archived, recorded };
}

describe("runLearningCycle", () => {
  it("is a no-op when nothing is proposed", async () => {
    const { d, recorded } = deps({ proposed: [], skills: {} });
    expect(await runLearningCycle(d)).toEqual({ proposed: 0, outcomes: [] });
    expect(recorded).toHaveLength(0);
  });

  it("adopts a gate-passing skill, records it, and never archives it", async () => {
    const { d, archived, recorded } = deps({
      proposed: [{ name: "debug-vitest", existed: false }],
      skills: { "debug-vitest": mkSkill("debug-vitest", GOOD) },
    });
    const r = await runLearningCycle(d);
    expect(r.outcomes[0]!).toMatchObject({ skill: "debug-vitest", kind: "minted", adopted: true });
    expect(archived).toEqual([]);
    expect(recorded[0]!).toMatchObject({ skill: "debug-vitest", adopted: true });
  });

  it("rejects a refusal skill: archives it (revert) and records adopted:false", async () => {
    const { d, archived, recorded } = deps({
      proposed: [{ name: "avoid-browser", existed: false }],
      skills: { "avoid-browser": mkSkill("avoid-browser", "the browser tool is broken, never use it again here") },
    });
    const r = await runLearningCycle(d);
    expect(r.outcomes[0]!.adopted).toBe(false);
    expect(archived).toEqual(["avoid-browser"]);
    expect(recorded[0]!.adopted).toBe(false);
  });

  it("labels a re-written existing skill as 'refined'", async () => {
    const { d } = deps({
      proposed: [{ name: "debug-vitest", existed: true }],
      skills: { "debug-vitest": mkSkill("debug-vitest", GOOD) },
    });
    expect((await runLearningCycle(d)).outcomes[0]!.kind).toBe("refined");
  });

  it("treats an unreadable proposed skill as a rejection (defensive)", async () => {
    const { d, recorded } = deps({ proposed: [{ name: "ghost", existed: false }], skills: {} });
    const r = await runLearningCycle(d);
    expect(r.outcomes[0]!.adopted).toBe(false);
    expect(recorded[0]!.reason).toMatch(/could not be read/);
  });
});

describe("formatCycleNote", () => {
  it("is quiet when nothing was proposed", () => {
    expect(formatCycleNote({ proposed: 0, outcomes: [] })).toBe("");
  });
  it("names adopted and gated-out skills", () => {
    const note = formatCycleNote({
      proposed: 2,
      outcomes: [
        { skill: "a", kind: "minted", adopted: true, reason: "ok" },
        { skill: "b", kind: "minted", adopted: false, reason: "refusal" },
      ],
    });
    expect(note).toMatch(/learned a \(minted\)/);
    expect(note).toMatch(/gated out b/);
  });
});
