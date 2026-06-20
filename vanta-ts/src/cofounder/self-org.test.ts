import { describe, expect, it, vi } from "vitest";
import {
  type Proposal,
  type ProposalStoreFs,
  type SelfOrgSignals,
  mergeProposals,
  pendingProposals,
  proposalId,
  proposeFromSignals,
  ratifyProposal,
  readProposals,
  rejectProposal,
  writeProposals,
} from "./self-org.js";

const EMPTY: SelfOrgSignals = { overBudgetDepartments: [], stalledObjectives: [] };

function pending(over: string[], stalled: string[]): Proposal[] {
  return proposeFromSignals({ overBudgetDepartments: over, stalledObjectives: stalled });
}

/** Non-null assert for indexed access under noUncheckedIndexedAccess. */
function nn<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

describe("proposeFromSignals", () => {
  it("emits a hire proposal for an over-budget department", () => {
    const proposals = pending(["growth"], []);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ kind: "hire", departmentId: "growth", status: "pending" });
    expect(nn(proposals[0]).detail).toContain("growth");
  });

  it("emits a routine proposal for a stalled objective", () => {
    const proposals = pending([], ["grow-revenue"]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ kind: "routine", departmentId: "grow-revenue", status: "pending" });
    expect(nn(proposals[0]).detail).toContain("grow-revenue");
  });

  it("emits both a hire and a routine when both signals fire", () => {
    const proposals = pending(["growth"], ["grow-revenue"]);
    expect(proposals.map((p) => p.kind)).toEqual(["hire", "routine"]);
  });

  it("emits nothing when there are no signals", () => {
    expect(proposeFromSignals(EMPTY)).toEqual([]);
  });

  it("dedupes repeated and blank signal ids", () => {
    const proposals = pending(["growth", "growth", "  "], ["grow-revenue", "grow-revenue"]);
    expect(proposals).toHaveLength(2);
  });

  it("produces deterministic, stable ids for the same signal", () => {
    expect(nn(pending(["growth"], [])[0]).id).toBe(nn(pending(["growth"], [])[0]).id);
  });
});

describe("proposalId", () => {
  it("is namespaced by kind so a dept and objective with the same id don't collide", () => {
    expect(proposalId("hire", "growth", "x")).not.toBe(proposalId("routine", "growth", "x"));
  });
});

describe("ratifyProposal", () => {
  it("marks the proposal ratified AND calls applyChange with it", async () => {
    const list = pending(["growth"], []);
    const applyChange = vi.fn(async () => {});
    const result = await ratifyProposal(nn(list[0]).id, list, { applyChange });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(nn(result.value[0]).status).toBe("ratified");
    expect(applyChange).toHaveBeenCalledTimes(1);
    expect(applyChange).toHaveBeenCalledWith(list[0]);
  });

  it("does not mutate the input list (returns a new list)", async () => {
    const list = pending(["growth"], []);
    await ratifyProposal(nn(list[0]).id, list, { applyChange: async () => {} });
    expect(nn(list[0]).status).toBe("pending");
  });

  it("errors and does NOT applyChange for an unknown id", async () => {
    const list = pending(["growth"], []);
    const applyChange = vi.fn(async () => {});
    const result = await ratifyProposal("nope", list, { applyChange });
    expect(result.ok).toBe(false);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("refuses to re-apply an already-ratified proposal", async () => {
    const list = pending(["growth"], []);
    const applyChange = vi.fn(async () => {});
    const once = await ratifyProposal(nn(list[0]).id, list, { applyChange });
    if (!once.ok) throw new Error(once.error);
    const twice = await ratifyProposal(nn(list[0]).id, once.value, { applyChange });
    expect(twice.ok).toBe(false);
    expect(applyChange).toHaveBeenCalledTimes(1);
  });
});

describe("rejectProposal", () => {
  it("marks the proposal rejected and does NOT applyChange (no side effect path)", () => {
    const list = pending(["growth"], []);
    const result = rejectProposal(nn(list[0]).id, list);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(nn(result.value[0]).status).toBe("rejected");
    // reject has no applyChange parameter at all — the org is never touched.
  });

  it("errors for an unknown id", () => {
    const list = pending(["growth"], []);
    expect(rejectProposal("nope", list).ok).toBe(false);
  });

  it("refuses to reject an already-rejected proposal", () => {
    const list = pending(["growth"], []);
    const once = rejectProposal(nn(list[0]).id, list);
    if (!once.ok) throw new Error(once.error);
    expect(rejectProposal(nn(list[0]).id, once.value).ok).toBe(false);
  });

  it("refuses to reject a ratified proposal", async () => {
    const list = pending(["growth"], []);
    const ratified = await ratifyProposal(nn(list[0]).id, list, { applyChange: async () => {} });
    if (!ratified.ok) throw new Error(ratified.error);
    expect(rejectProposal(nn(list[0]).id, ratified.value).ok).toBe(false);
  });
});

describe("queue helpers", () => {
  it("pendingProposals filters out decided proposals", () => {
    const list = pending(["growth"], ["grow-revenue"]);
    const decided = rejectProposal(nn(list[0]).id, list);
    if (!decided.ok) throw new Error(decided.error);
    expect(pendingProposals(decided.value)).toHaveLength(1);
  });

  it("mergeProposals appends only new ids (idempotent re-propose)", () => {
    const first = pending(["growth"], []);
    const merged = mergeProposals(first, pending(["growth"], ["grow-revenue"]));
    expect(merged).toHaveLength(2);
    expect(merged.filter((p) => p.kind === "hire")).toHaveLength(1);
  });
});

// ---- Store (injected fs) ----

function memoryFs(initial: Record<string, string> = {}): ProposalStoreFs & { files: Record<string, string> } {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    readFile: async (p) => {
      const data = files[p];
      if (data === undefined) throw new Error("ENOENT");
      return data;
    },
    writeFile: async (p, d) => void (files[p] = d),
    mkdir: async () => {},
  };
}

const ENV = { VANTA_HOME: "/tmp/self-org-test" } as unknown as NodeJS.ProcessEnv;

describe("store", () => {
  it("round-trips proposals through write then read", async () => {
    const fs = memoryFs();
    const list = pending(["growth"], ["grow-revenue"]);
    await writeProposals(list, ENV, fs);
    expect(await readProposals(ENV, fs)).toEqual(list);
  });

  it("returns [] for a missing file", async () => {
    expect(await readProposals(ENV, memoryFs())).toEqual([]);
  });

  it("returns [] for corrupt JSON (tolerant reader)", async () => {
    const fs = memoryFs();
    await fs.writeFile(`${ENV.VANTA_HOME}/proposals.json`, "{ not json");
    expect(await readProposals(ENV, fs)).toEqual([]);
  });

  it("drops malformed rows but keeps valid ones", async () => {
    const good = nn(pending(["growth"], [])[0]);
    const fs = memoryFs({
      [`${ENV.VANTA_HOME}/proposals.json`]: JSON.stringify({
        version: 1,
        proposals: [good, { id: "bad", kind: "unknown-kind", departmentId: "x", detail: "y", status: "pending" }],
      }),
    });
    const read = await readProposals(ENV, fs);
    expect(read).toEqual([good]);
  });
});
