import { describe, it, expect } from "vitest";
import {
  resolvePruneScorerKind,
  describePruneScorer,
  pruneScorerLadder,
  type ScorerKind,
} from "./prune-scorer.js";

const ON = { VANTA_WINNOW_LOGPROB: "1" };
const OFF: NodeJS.ProcessEnv = {};

describe("resolvePruneScorerKind", () => {
  it("picks 'logprob' when logprob is enabled AND a source is present (top rung)", () => {
    expect(resolvePruneScorerKind(ON, { logprobSource: true })).toBe("logprob");
    // logprob wins over an also-available local scorer (best rung first)
    expect(resolvePruneScorerKind(ON, { logprobSource: true, localScorer: true })).toBe("logprob");
  });

  it("does NOT pick 'logprob' when enabled but NO source — falls to the next rung", () => {
    // enabled, no source, a local scorer is present → local
    expect(resolvePruneScorerKind(ON, { localScorer: true })).toBe("local");
    // enabled, no source, nothing else → the heuristic floor
    expect(resolvePruneScorerKind(ON, {})).toBe("heuristic");
    expect(resolvePruneScorerKind(ON, { logprobSource: false })).toBe("heuristic");
  });

  it("does NOT pick 'logprob' when disabled via env even with a source present", () => {
    expect(resolvePruneScorerKind(OFF, { logprobSource: true })).toBe("heuristic");
    expect(resolvePruneScorerKind({ VANTA_WINNOW_LOGPROB: "0" }, { logprobSource: true })).toBe(
      "heuristic",
    );
    // disabled but a local scorer is available → local (still never logprob)
    expect(resolvePruneScorerKind(OFF, { logprobSource: true, localScorer: true })).toBe("local");
  });

  it("picks 'local' when a local scorer is available and logprob was not chosen", () => {
    expect(resolvePruneScorerKind(OFF, { localScorer: true })).toBe("local");
  });

  it("falls to 'heuristic' (the floor) when nothing is available", () => {
    expect(resolvePruneScorerKind(OFF, {})).toBe("heuristic");
  });

  it("no config (empty env, empty availability) → 'heuristic' (unchanged behavior)", () => {
    expect(resolvePruneScorerKind({}, {})).toBe("heuristic");
  });

  it("never returns an unavailable scorer — the kind is always backed by availability or is the floor", () => {
    const cases: Array<{ env: NodeJS.ProcessEnv; avail: Parameters<typeof resolvePruneScorerKind>[1] }> =
      [
        { env: ON, avail: { logprobSource: true } },
        { env: ON, avail: { localScorer: true } },
        { env: ON, avail: {} },
        { env: OFF, avail: { logprobSource: true, localScorer: true } },
        { env: OFF, avail: {} },
      ];
    for (const { env, avail } of cases) {
      const kind = resolvePruneScorerKind(env, avail);
      if (kind === "logprob") expect(avail.logprobSource).toBe(true);
      else if (kind === "local") expect(avail.localScorer).toBe(true);
      else expect(kind).toBe("heuristic"); // always-available floor
    }
  });

  it("always resolves to a valid ladder rung (never empty)", () => {
    const ladder = pruneScorerLadder();
    const kind = resolvePruneScorerKind(OFF, {});
    expect(ladder).toContain(kind);
  });
});

describe("describePruneScorer", () => {
  it("returns the per-kind one-line label", () => {
    expect(describePruneScorer("logprob")).toBe("LM-logprob (LLMLingua)");
    expect(describePruneScorer("local")).toBe("local logprob");
    expect(describePruneScorer("heuristic")).toBe("heuristic (token surprisal proxy)");
  });

  it("has a distinct, non-empty label for every ladder rung", () => {
    const labels = pruneScorerLadder().map(describePruneScorer);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length); // all distinct
  });
});

describe("pruneScorerLadder", () => {
  it("is the ordered preference list logprob > local > heuristic", () => {
    expect(pruneScorerLadder()).toEqual<ScorerKind[]>(["logprob", "local", "heuristic"]);
  });

  it("ends with the guaranteed floor 'heuristic'", () => {
    const ladder = pruneScorerLadder();
    expect(ladder[ladder.length - 1]).toBe("heuristic");
  });

  it("returns a fresh array (callers cannot mutate the canonical order)", () => {
    const a = pruneScorerLadder();
    a[0] = "heuristic";
    expect(pruneScorerLadder()[0]).toBe("logprob");
  });
});
