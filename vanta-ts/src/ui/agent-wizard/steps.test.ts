import { describe, it, expect } from "vitest";
import {
  STEP_IDS,
  STEP_COUNT,
  emptyDraft,
  canAdvance,
  blockReason,
  nextStep,
  prevStep,
  isLastStep,
  stepPosition,
  draftToDefinition,
  type AgentDraft,
} from "./steps.js";

/** A fully-filled draft that satisfies every step. */
function completeDraft(): AgentDraft {
  return {
    type: "researcher",
    description: "Researches a topic and cites sources.",
    name: "Topic Researcher",
    model: "gpt-4o",
    tools: ["web_search", "web_fetch"],
    systemPrompt: "You research topics and cite every claim.",
    location: "home",
  };
}

describe("step ordering", () => {
  it("lists the eight steps in the documented order", () => {
    expect(STEP_IDS).toEqual([
      "type",
      "description",
      "model",
      "tools",
      "prompt",
      "generate",
      "location",
      "confirm",
    ]);
    expect(STEP_COUNT).toBe(8);
  });

  it("nextStep advances and clamps at the last step", () => {
    expect(nextStep("type")).toBe("description");
    expect(nextStep("generate")).toBe("location");
    expect(nextStep("confirm")).toBe("confirm"); // clamped
  });

  it("prevStep retreats and clamps at the first step", () => {
    expect(prevStep("description")).toBe("type");
    expect(prevStep("type")).toBe("type"); // clamped
  });

  it("isLastStep is true only for confirm", () => {
    expect(isLastStep("confirm")).toBe(true);
    expect(isLastStep("type")).toBe(false);
  });

  it("stepPosition is 1-based", () => {
    expect(stepPosition("type")).toBe(1);
    expect(stepPosition("confirm")).toBe(8);
  });
});

describe("canAdvance — per-step validation", () => {
  it("blocks the empty draft on Type", () => {
    expect(canAdvance("type", emptyDraft())).toBe(false);
  });

  it("advances Type once a type is entered", () => {
    expect(canAdvance("type", { ...emptyDraft(), type: "writer" })).toBe(true);
  });

  it("requires a Description of at least 8 characters", () => {
    expect(canAdvance("description", { ...emptyDraft(), description: "short" })).toBe(false);
    expect(canAdvance("description", { ...emptyDraft(), description: "long enough" })).toBe(true);
  });

  it("treats Model as optional but trims-strict when set", () => {
    expect(canAdvance("model", { ...emptyDraft(), model: "" })).toBe(true);
    expect(canAdvance("model", { ...emptyDraft(), model: "gpt-4o" })).toBe(true);
  });

  it("treats Tools as always satisfiable (empty = inherit all)", () => {
    expect(canAdvance("tools", emptyDraft())).toBe(true);
  });

  it("requires a valid name at the Prompt step", () => {
    expect(canAdvance("prompt", { ...emptyDraft(), name: "" })).toBe(false);
    expect(canAdvance("prompt", { ...emptyDraft(), name: "9bad" })).toBe(false);
    expect(canAdvance("prompt", { ...emptyDraft(), name: "Good Name" })).toBe(true);
  });

  it("requires a system prompt to leave the Generate step", () => {
    expect(canAdvance("generate", { ...emptyDraft(), systemPrompt: "" })).toBe(false);
    expect(canAdvance("generate", { ...emptyDraft(), systemPrompt: "You are…" })).toBe(true);
  });

  it("accepts either location", () => {
    expect(canAdvance("location", { ...emptyDraft(), location: "home" })).toBe(true);
    expect(canAdvance("location", { ...emptyDraft(), location: "project" })).toBe(true);
  });

  it("always allows Confirm", () => {
    expect(canAdvance("confirm", emptyDraft())).toBe(true);
  });
});

describe("blockReason", () => {
  it("is empty when the step can advance", () => {
    expect(blockReason("type", { ...emptyDraft(), type: "x" })).toBe("");
  });
  it("explains a blocked Type step", () => {
    expect(blockReason("type", emptyDraft())).toMatch(/type/i);
  });
  it("explains a blocked Description step", () => {
    expect(blockReason("description", emptyDraft())).toMatch(/8 characters/i);
  });
  it("explains a blocked Prompt (name) step", () => {
    expect(blockReason("prompt", emptyDraft())).toMatch(/name/i);
  });
});

describe("draftToDefinition", () => {
  it("projects a complete draft to the agentgen shape", () => {
    const result = draftToDefinition(completeDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.def.identifier).toBe("topic-researcher");
    expect(result.def.whenToUse).toBe("Researches a topic and cites sources.");
    expect(result.def.systemPrompt).toContain("Model: gpt-4o");
    expect(result.def.systemPrompt).toContain("Tools: web_search, web_fetch");
    expect(result.def.systemPrompt).toContain("You research topics and cite every claim.");
  });

  it("omits the model/tools header when neither is set", () => {
    const draft: AgentDraft = { ...completeDraft(), model: "", tools: [] };
    const result = draftToDefinition(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.def.systemPrompt).toBe("You research topics and cite every claim.");
  });

  it("clamps an over-long description to 400 chars for whenToUse", () => {
    const draft: AgentDraft = { ...completeDraft(), description: "x".repeat(600) };
    const result = draftToDefinition(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.def.whenToUse.length).toBe(400);
  });

  it("fails as a value when the draft is incomplete", () => {
    const result = draftToDefinition({ ...emptyDraft(), name: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/missing/i);
  });

  it("produces an identifier the agent schema accepts (kebab-case)", () => {
    const result = draftToDefinition({ ...completeDraft(), name: "My  Cool Agent!!" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.def.identifier).toBe("my-cool-agent");
  });
});
