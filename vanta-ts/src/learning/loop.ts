import { reviewTurn } from "../review/background-review.js";
import { listSkills, readSkill, archiveSkill, LEARNED_TAG } from "../skills/store.js";
import { gateSkill, type GateResult } from "./eval-gate.js";
import { recordLearning, type LearningEvent } from "./ledger.js";
import type { LLMProvider } from "../providers/interface.js";
import type { KernelClient } from "../kernel/client.js";
import type { Skill } from "../skills/types.js";
import type { Message } from "../types.js";

// VANTA-SELF-LEARNING-LOOP — the ONE named closed loop the card asks for. It does
// NOT reinvent learning; it UNIFIES the shipped pieces into a legible cycle:
//   observe trajectory → propose skill (background-review) → eval-gate (no-regress)
//   → adopt (gated; reject = archive) → measure (ledger).
// Every step is injected so the orchestration is fully unit-tested with fakes; the
// defaults wire the real reviewTurn / skills store / gate / ledger.

/** A skill the propose step wrote, with whether it pre-existed (refine vs mint). */
export type Proposed = { name: string; existed: boolean };

/** Injected steps — defaults wire the live pieces; tests pass fakes. */
export type LearningDeps = {
  /** Observe + propose: returns the names of skills written, and which pre-existed. */
  propose: () => Promise<Proposed[]>;
  /** Load a written skill for gating. */
  load: (name: string) => Promise<Skill | null>;
  /** Names of hand-authored (non-learned) skills the gate must not let be shadowed. */
  handAuthored: () => Promise<Set<string>>;
  /** Gate a proposed skill — adopt iff it passes. */
  gate: (skill: Skill, handAuthored: ReadonlySet<string>) => GateResult;
  /** Reject path: reversibly archive a skill that failed the gate. */
  archive: (name: string) => Promise<boolean>;
  /** Measure: append the outcome to the ledger. */
  record: (event: LearningEvent) => Promise<void>;
  now: () => Date;
};

export type CycleOutcome = {
  skill: string;
  kind: "minted" | "refined";
  adopted: boolean;
  reason: string;
};
export type LearningCycleResult = { proposed: number; outcomes: CycleOutcome[] };

/**
 * Run one self-learning cycle. Returns a structured result (adopted vs rejected
 * per proposed skill). Best-effort per skill: a load/gate/archive failure for one
 * proposal becomes a recorded rejection, never an exception that aborts the cycle.
 */
export async function runLearningCycle(deps: LearningDeps): Promise<LearningCycleResult> {
  const proposed = await deps.propose();
  if (proposed.length === 0) return { proposed: 0, outcomes: [] };
  const handAuthored = await deps.handAuthored();
  const outcomes: CycleOutcome[] = [];

  for (const p of proposed) {
    const kind = p.existed ? "refined" : "minted";
    const skill = await deps.load(p.name).catch(() => null);
    const gate: GateResult = skill
      ? deps.gate(skill, handAuthored)
      : { passed: false, reason: "proposed skill could not be read back" };

    if (!gate.passed) await deps.archive(p.name).catch(() => false);

    const outcome: CycleOutcome = { skill: p.name, kind, adopted: gate.passed, reason: gate.reason };
    outcomes.push(outcome);
    await deps.record({ ts: deps.now().toISOString(), ...outcome });
  }
  return { proposed: proposed.length, outcomes };
}

/**
 * Build the live deps: propose = reviewTurn (snapshotting learned-skill names so
 * a re-write registers as a "refined"), gate = the deterministic eval-gate over
 * hand-authored names, archive/record = the real store/ledger.
 */
export function defaultLearningDeps(opts: {
  provider: LLMProvider;
  safety: KernelClient;
  root: string;
  dataDir: string;
  transcript: Message[];
  env?: NodeJS.ProcessEnv;
}): LearningDeps {
  const env = opts.env ?? process.env;
  return {
    propose: async () => {
      const before = new Set((await learnedNames(env)));
      const { wrote } = await reviewTurn({ provider: opts.provider, safety: opts.safety, root: opts.root, transcript: opts.transcript });
      return wrote.map((name) => ({ name, existed: before.has(name) }));
    },
    load: (name) => readSkill(name, env),
    handAuthored: async () => new Set((await listSkills(env)).filter((s) => !s.meta.tags.includes(LEARNED_TAG)).map((s) => s.meta.name)),
    gate: gateSkill,
    archive: (name) => archiveSkill(name, env),
    record: (event) => recordLearning(opts.dataDir, event),
    now: () => new Date(),
  };
}

async function learnedNames(env: NodeJS.ProcessEnv): Promise<string[]> {
  return (await listSkills(env)).filter((s) => s.meta.tags.includes(LEARNED_TAG)).map((s) => s.meta.name);
}

/** A one-line summary of a finished cycle for the host to surface (or "" if quiet). */
export function formatCycleNote(r: LearningCycleResult): string {
  if (r.proposed === 0) return "";
  const adopted = r.outcomes.filter((o) => o.adopted);
  const rejected = r.outcomes.filter((o) => !o.adopted);
  const parts: string[] = [];
  if (adopted.length) parts.push(`learned ${adopted.map((o) => `${o.skill} (${o.kind})`).join(", ")}`);
  if (rejected.length) parts.push(`gated out ${rejected.map((o) => o.skill).join(", ")}`);
  return parts.length ? `  ▸ self-learning: ${parts.join("; ")}` : "";
}
