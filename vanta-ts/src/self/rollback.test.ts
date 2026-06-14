import { describe, it, expect } from "vitest";
import { proposeRollback, formatRollbackProposal, isCompartment } from "./rollback.js";
import type { RepairMarker } from "./detect.js";

// ---------------------------------------------------------------------------
// proposeRollback
// ---------------------------------------------------------------------------

describe("proposeRollback", () => {
  it("returns the lkg sha + a non-null command when a marker exists", () => {
    const markers: RepairMarker[] = [
      { compartment: "limbs", sha: "abc1234", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("limbs", markers);
    expect(proposal.sha).toBe("abc1234");
    expect(proposal.command).not.toBeNull();
    expect(proposal.command).toContain("abc1234");
    expect(proposal.reason).toBeNull();
    expect(proposal.compartment).toBe("limbs");
  });

  it("returns command:null + a reason when no marker exists", () => {
    const proposal = proposeRollback("brainstem", []);
    expect(proposal.sha).toBeNull();
    expect(proposal.command).toBeNull();
    expect(typeof proposal.reason).toBe("string");
    expect(proposal.reason!.length).toBeGreaterThan(0);
  });

  it("picks the most recent marker when multiple exist for a compartment", () => {
    const markers: RepairMarker[] = [
      { compartment: "reflexes", sha: "old000", ts: "2024-01-01T00:00:00.000Z" },
      { compartment: "reflexes", sha: "new999", ts: "2024-12-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("reflexes", markers);
    expect(proposal.sha).toBe("new999");
    expect(proposal.command).toContain("new999");
  });

  it("ignores markers for other compartments", () => {
    const markers: RepairMarker[] = [
      { compartment: "memory", sha: "memsha", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("skeleton", markers);
    expect(proposal.sha).toBeNull();
    expect(proposal.command).toBeNull();
  });

  it("brainstem command includes the compartment paths", () => {
    const markers: RepairMarker[] = [
      { compartment: "brainstem", sha: "deadbeef", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("brainstem", markers);
    expect(proposal.command).toContain("git checkout");
    expect(proposal.command).toContain("deadbeef");
    expect(proposal.command).toContain("src/");
  });

  it("skeleton command targets the factory path", () => {
    const markers: RepairMarker[] = [
      { compartment: "skeleton", sha: "f00dcafe", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("skeleton", markers);
    expect(proposal.command).toContain("f00dcafe");
    expect(proposal.command).toContain("vanta-ts/src/factory/");
  });

  it("reflexes command targets the agent + prompt paths", () => {
    const markers: RepairMarker[] = [
      { compartment: "reflexes", sha: "cafe0000", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("reflexes", markers);
    expect(proposal.command).toContain("vanta-ts/src/agent.ts");
  });

  it("memory command targets world/money/radar/team/brain/.vanta paths", () => {
    const markers: RepairMarker[] = [
      { compartment: "memory", sha: "aaaabbbb", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("memory", markers);
    expect(proposal.command).toContain("aaaabbbb");
    expect(proposal.command).toContain("vanta-ts/src/world/");
  });

  it("limbs command includes inspect advice (no narrow paths)", () => {
    const markers: RepairMarker[] = [
      { compartment: "limbs", sha: "1234abcd", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("limbs", markers);
    expect(proposal.command).toContain("git log");
    expect(proposal.command).toContain("1234abcd");
  });
});

// ---------------------------------------------------------------------------
// formatRollbackProposal
// ---------------------------------------------------------------------------

describe("formatRollbackProposal", () => {
  it("outputs the sha + command when proposal is present", () => {
    const markers: RepairMarker[] = [
      { compartment: "brainstem", sha: "abc12345", ts: "2024-06-01T00:00:00.000Z" },
    ];
    const proposal = proposeRollback("brainstem", markers);
    const output = formatRollbackProposal(proposal);
    expect(output).toContain("abc12345");
    expect(output).toContain("proposal only");
    expect(output).not.toContain("No marker");
  });

  it("outputs the no-marker explanation when sha is null", () => {
    const proposal = proposeRollback("skeleton", []);
    const output = formatRollbackProposal(proposal);
    expect(output).toContain("No marker");
    expect(output).not.toContain("git checkout");
  });
});

// ---------------------------------------------------------------------------
// isCompartment
// ---------------------------------------------------------------------------

describe("isCompartment", () => {
  it("returns true for all valid compartment names", () => {
    for (const name of ["brainstem", "skeleton", "reflexes", "limbs", "memory"]) {
      expect(isCompartment(name)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isCompartment("unknown")).toBe(false);
    expect(isCompartment("")).toBe(false);
    expect(isCompartment("LIMBS")).toBe(false);
  });
});
