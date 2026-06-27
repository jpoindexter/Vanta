import { describe, it, expect } from "vitest";
import { reasoningDelta } from "./openai-convert.js";

// Universal reasoning-field extraction: the OpenAI-compatible adapter is what most user-added models
// flow through, so surfacing thinking here makes it work for ANY reasoning model regardless of vendor.
describe("reasoningDelta — universal reasoning-field extraction", () => {
  it("reads DeepSeek-R1 `reasoning_content`", () => {
    expect(reasoningDelta({ reasoning_content: "let me think" })).toBe("let me think");
  });
  it("reads OpenRouter / gateway `reasoning`", () => {
    expect(reasoningDelta({ reasoning: "step 1: ..." })).toBe("step 1: ...");
  });
  it("prefers `reasoning_content` when both are present", () => {
    expect(reasoningDelta({ reasoning_content: "a", reasoning: "b" })).toBe("a");
  });
  it("returns undefined for an ordinary content delta (non-reasoning model)", () => {
    expect(reasoningDelta({ content: "hello world" })).toBeUndefined();
  });
  it("returns undefined for empty / absent / non-string fields (self-disabling per model)", () => {
    expect(reasoningDelta({ reasoning_content: "" })).toBeUndefined();
    expect(reasoningDelta({})).toBeUndefined();
    expect(reasoningDelta(undefined)).toBeUndefined();
    expect(reasoningDelta({ reasoning: 42 })).toBeUndefined();
  });
});
