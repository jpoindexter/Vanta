import { describe, it, expect } from "vitest";
import { validateWorkflow, describeStep, type WorkflowStep } from "./workflow.js";

describe("validateWorkflow", () => {
  it("accepts a valid spec", () => {
    const spec = {
      name: "test-workflow",
      description: "A test",
      steps: [{ id: "s1", type: "fan-out", instruction: "Find bugs in src/", agents: 3 }],
    };
    expect(validateWorkflow(spec)).toBeNull();
  });

  it("rejects missing name", () => {
    const spec = { description: "x", steps: [{ id: "s1", type: "fan-out", instruction: "x" }] };
    expect(validateWorkflow(spec)).not.toBeNull();
  });

  it("rejects empty steps", () => {
    const spec = { name: "x", description: "y", steps: [] };
    expect(validateWorkflow(spec)).not.toBeNull();
  });

  it("rejects invalid step type", () => {
    const spec = { name: "x", description: "y", steps: [{ id: "s1", type: "invalid", instruction: "x" }] };
    expect(validateWorkflow(spec)).not.toBeNull();
  });

  it("rejects agents > 16", () => {
    const spec = { name: "x", description: "y", steps: [{ id: "s1", type: "fan-out", instruction: "x", agents: 17 }] };
    expect(validateWorkflow(spec)).not.toBeNull();
  });
});

describe("describeStep", () => {
  it("formats a step with agent count", () => {
    const step: WorkflowStep = { id: "s1", type: "fan-out", instruction: "Search for issues", agents: 4 };
    const desc = describeStep(step);
    expect(desc).toContain("fan-out");
    expect(desc).toContain("×4");
  });

  it("omits agent count when not specified", () => {
    const step: WorkflowStep = { id: "s1", type: "synthesize", instruction: "Synthesize findings" };
    expect(describeStep(step)).not.toContain("×");
  });
});
