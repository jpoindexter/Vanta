import { describe, expect, it, vi } from "vitest";
import { type Proposal, proposeFromSignals } from "../cofounder/self-org.js";
import { type ProposalDeps, formatProposal, handleProposal } from "./proposal-cmd.js";

function seed(over: string[] = ["growth"], stalled: string[] = ["grow-revenue"]): Proposal[] {
  return proposeFromSignals({ overBudgetDepartments: over, stalledObjectives: stalled });
}

/** Non-null assert for indexed access under noUncheckedIndexedAccess. */
function nn<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

function makeDeps(initial: Proposal[]): {
  deps: ProposalDeps;
  lines: string[];
  applyChange: ReturnType<typeof vi.fn>;
  saved: () => Proposal[];
} {
  let store = [...initial];
  const lines: string[] = [];
  const applyChange = vi.fn(async () => {});
  const deps: ProposalDeps = {
    readProposals: async () => store,
    writeProposals: async (list) => void (store = list),
    applyChange,
    log: (line) => lines.push(line),
  };
  return { deps, lines, applyChange, saved: () => store };
}

describe("handleProposal list", () => {
  it("prints each proposal and exits 0", async () => {
    const { deps, lines } = makeDeps(seed());
    expect(await handleProposal(["list"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("hire");
    expect(lines.join("\n")).toContain("routine");
  });

  it("reports the empty queue and exits 0", async () => {
    const { deps, lines } = makeDeps([]);
    expect(await handleProposal(["list"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("no proposals");
  });
});

describe("handleProposal ratify", () => {
  it("marks ratified, calls applyChange, and persists", async () => {
    const seeded = seed();
    const { deps, lines, applyChange, saved } = makeDeps(seeded);
    expect(await handleProposal(["ratify", nn(seeded[0]).id], deps)).toBe(0);
    expect(applyChange).toHaveBeenCalledTimes(1);
    expect(applyChange).toHaveBeenCalledWith(seeded[0]);
    expect(nn(saved()[0]).status).toBe("ratified");
    expect(lines.join("\n")).toContain("ratified");
  });

  it("errors (exit 1) and never applies for an unknown id", async () => {
    const { deps, applyChange } = makeDeps(seed());
    expect(await handleProposal(["ratify", "nope"], deps)).toBe(1);
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("requires an id", async () => {
    const { deps } = makeDeps(seed());
    expect(await handleProposal(["ratify"], deps)).toBe(1);
  });
});

describe("handleProposal reject", () => {
  it("marks rejected, persists, and does NOT call applyChange", async () => {
    const seeded = seed();
    const { deps, lines, applyChange, saved } = makeDeps(seeded);
    expect(await handleProposal(["reject", nn(seeded[0]).id], deps)).toBe(0);
    expect(applyChange).not.toHaveBeenCalled();
    expect(nn(saved()[0]).status).toBe("rejected");
    expect(lines.join("\n")).toContain("rejected");
  });

  it("errors (exit 1) for an unknown id", async () => {
    const { deps } = makeDeps(seed());
    expect(await handleProposal(["reject", "nope"], deps)).toBe(1);
  });
});

describe("handleProposal dispatch", () => {
  it("prints usage and exits 0 for no subcommand", async () => {
    const { deps, lines } = makeDeps([]);
    expect(await handleProposal([], deps)).toBe(0);
    expect(lines.join("\n")).toContain("usage:");
  });

  it("prints usage and exits 1 for an unknown subcommand", async () => {
    const { deps, lines } = makeDeps([]);
    expect(await handleProposal(["frobnicate"], deps)).toBe(1);
    expect(lines.join("\n")).toContain("usage:");
  });
});

describe("formatProposal", () => {
  it("shows kind, department, status, and detail", () => {
    const p = nn(seed(["growth"], [])[0]);
    const out = formatProposal(p);
    expect(out).toContain("hire");
    expect(out).toContain("dept:growth");
    expect(out).toContain("pending");
    expect(out).toContain(p.detail);
  });

  it("marks ratified with ✓ and rejected with ✗", () => {
    const p = nn(seed(["growth"], [])[0]);
    expect(formatProposal({ ...p, status: "ratified" })).toContain("✓");
    expect(formatProposal({ ...p, status: "rejected" })).toContain("✗");
  });
});
