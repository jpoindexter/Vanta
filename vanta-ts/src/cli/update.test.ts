import { describe, it, expect } from "vitest";

// SELF-UPDATE: the safe self-updater is mostly shell orchestration and can't be
// unit-tested without a real git repo + network. These tests verify the module
// exports are present and the types are correct. Live verification requires a
// real terminal and a tracking branch.

describe("update module", () => {
  it("exports runUpdateCommand", async () => {
    const mod = await import("./update.js");
    expect(typeof mod.runUpdateCommand).toBe("function");
  });
});
