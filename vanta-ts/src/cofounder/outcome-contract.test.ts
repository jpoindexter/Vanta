import { describe, it, expect } from "vitest";
import {
  requireOutcome,
  canCloseTask,
  closeWithReason,
  recordArtifact,
  type OutcomeContract,
} from "./outcome-contract.js";

const present = () => true;
const absent = () => false;

describe("requireOutcome", () => {
  it("attaches a contract with the declared expected output", () => {
    const r = requireOutcome({ id: "t1", title: "ship doc" }, "document");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.outcome).toEqual({ expectedOutput: "document" });
    expect(r.value.id).toBe("t1");
  });

  it("trims the expected output type", () => {
    const r = requireOutcome({}, "  pull_request  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.outcome.expectedOutput).toBe("pull_request");
  });

  it("refuses an empty expected output", () => {
    const r = requireOutcome({}, "   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/non-empty/);
  });
});

describe("canCloseTask", () => {
  const contract: OutcomeContract = { expectedOutput: "document" };

  it("closes when an artifact of the expected type exists", () => {
    expect(canCloseTask(contract, present)).toBe(true);
  });

  it("REFUSES when no artifact exists and no reason is set", () => {
    expect(canCloseTask(contract, absent)).toBe(false);
  });

  it("closes when an explicit no-artifact reason is set, even with no artifact", () => {
    const forced: OutcomeContract = { ...contract, noArtifactReason: "deprioritized by operator" };
    expect(canCloseTask(forced, absent)).toBe(true);
  });

  it("passes the expected output type to the injected predicate", () => {
    const seen: string[] = [];
    const probe = (t: string) => {
      seen.push(t);
      return true;
    };
    canCloseTask({ expectedOutput: "pull_request" }, probe);
    expect(seen).toEqual(["pull_request"]);
  });

  it("treats a whitespace-only reason as no reason (REFUSED without an artifact)", () => {
    const blank: OutcomeContract = { ...contract, noArtifactReason: "   " };
    expect(canCloseTask(blank, absent)).toBe(false);
  });
});

describe("closeWithReason", () => {
  const contract: OutcomeContract = { expectedOutput: "document" };

  it("persists the reason on the contract and allows close", () => {
    const r = closeWithReason(contract, "client cancelled before delivery");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.noArtifactReason).toBe("client cancelled before delivery");
    expect(canCloseTask(r.value, absent)).toBe(true);
  });

  it("trims the reason", () => {
    const r = closeWithReason(contract, "  no longer needed  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.noArtifactReason).toBe("no longer needed");
  });

  it("refuses an empty reason", () => {
    const r = closeWithReason(contract, "  ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/non-empty/);
  });

  it("does not mutate the input contract", () => {
    closeWithReason(contract, "some reason");
    expect(contract.noArtifactReason).toBeUndefined();
  });
});

describe("recordArtifact", () => {
  const contract: OutcomeContract = { expectedOutput: "document" };

  it("records which artifact satisfied the contract", () => {
    const r = recordArtifact(contract, "doc#42");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.satisfiedBy).toBe("doc#42");
  });

  it("refuses an empty artifact reference", () => {
    const r = recordArtifact(contract, "");
    expect(r.ok).toBe(false);
  });
});
