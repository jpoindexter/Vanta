import { describe, expect, it } from "vitest";
import { requiredToolNudge } from "./tool-use-contract.js";

describe("requiredToolNudge", () => {
  const available = ["compose_workflow", "brief", "protect"];

  it("requires validation for an explicit workflow drafting request", () => {
    const nudge = requiredToolNudge("Draft a Kubernetes briefing workflow for review", available, []);

    expect(nudge).toMatch(/compose_workflow.*validate/i);
    expect(nudge).toMatch(/each acceptance criterion/i);
    expect(nudge).toMatch(/validated graph evidence/i);
    expect(nudge).toMatch(/title.*not evidence/i);
  });

  it("does not force tool use for an explanatory workflow question", () => {
    expect(requiredToolNudge("What is a Kubernetes workflow?", available, [])).toBeNull();
  });

  it("does not request an unavailable or already-used tool", () => {
    expect(requiredToolNudge("Draft a workflow", ["brief"], [])).toBeNull();
    expect(requiredToolNudge("Draft a workflow", available, ["compose_workflow"])).toBeNull();
  });
});
