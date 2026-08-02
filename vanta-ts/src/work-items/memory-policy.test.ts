import { describe, expect, it } from "vitest";
import type { WorkItemState } from "./contract.js";
import { canPersistMemoryClaim } from "./memory-policy.js";

describe("accomplishment memory policy", () => {
  const nonverifiedStates: Array<WorkItemState | undefined> = [
    undefined,
    "draft",
    "queued",
    "running",
    "waiting",
    "needs human",
    "stopped",
    "failed",
    "unverified",
  ];

  it.each(nonverifiedStates)("blocks varied accomplishment claims while the WorkItem is %s", (state) => {
    for (const claim of [
      "We shipped the external delivery",
      "Accomplished the migration",
      "Solved the production bug",
      "The rollout is now complete",
      "Implemented the calendar integration",
    ]) {
      expect(canPersistMemoryClaim(claim, state)).toBe(false);
    }
  });

  it.each(nonverifiedStates)("preserves non-accomplishment memory while the WorkItem is %s", (state) => {
    expect(canPersistMemoryClaim("The user prefers short status updates", state)).toBe(true);
    expect(canPersistMemoryClaim("The user lives in Madrid", state)).toBe(true);
  });

  it("allows a verified accomplishment", () => {
    expect(canPersistMemoryClaim("We shipped the external delivery", "verified")).toBe(true);
  });
});
