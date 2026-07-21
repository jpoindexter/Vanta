import { describe, expect, it } from "vitest";
import { buildAnthropicEffortParams, buildOpenAIEffortParams } from "./effort.js";
import type { EffortLevel } from "../types.js";

const LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

describe("OpenAI effort mapping", () => {
  it("maps low/high/max to reasoning_effort and leaves medium unchanged", () => {
    const results = LEVELS.map((effortLevel) => buildOpenAIEffortParams("o3", { effortLevel }));
    expect(results).toEqual([
      { reasoning_effort: "low" },
      {},
      { reasoning_effort: "high" },
      { reasoning_effort: "xhigh" },
      { reasoning_effort: "max" },
    ]);
  });

  it("maps GPT-5 effort controls to reasoning_effort", () => {
    expect(buildOpenAIEffortParams("gpt-5.6-sol", { effortLevel: "xhigh" })).toEqual({ reasoning_effort: "xhigh" });
    expect(buildOpenAIEffortParams("gpt-5.3-codex", { effortLevel: "high" })).toEqual({ reasoning_effort: "high" });
  });

  it("skips unsupported OpenAI models with a debug message", () => {
    const logs: string[] = [];
    const result = buildOpenAIEffortParams("gpt-4o", { effortLevel: "high" }, (m) => logs.push(m));
    expect(result).toEqual({});
    expect(logs[0]).toContain("does not support reasoning_effort");
  });

  it("disables hidden MiniCPM5 reasoning so local turns return visible text", () => {
    expect(buildOpenAIEffortParams("hf.co/openbmb/MiniCPM5-1B-GGUF:q4_k_m")).toEqual({
      reasoning_effort: "none",
    });
  });
});

describe("Anthropic effort mapping", () => {
  it("maps low/medium/high/max to the expected thinking and max token params", () => {
    const results = LEVELS.map((effortLevel) =>
      buildAnthropicEffortParams("claude-sonnet-4-6", { effortLevel }, {}),
    );
    expect(results).toEqual([
      { max_tokens: 4096 },
      {},
      { max_tokens: 9024, thinking: { type: "enabled", budget_tokens: 8000 } },
      {},
      { max_tokens: 33024, thinking: { type: "enabled", budget_tokens: 32000 } },
    ]);
  });

  it("preserves the existing VANTA_THINKING_BUDGET behavior for medium", () => {
    const result = buildAnthropicEffortParams("claude-sonnet-4-6", { effortLevel: "medium" }, { VANTA_THINKING_BUDGET: "6000" } as NodeJS.ProcessEnv);
    expect(result).toEqual({ max_tokens: 7024, thinking: { type: "enabled", budget_tokens: 6000 } });
  });

  it("skips unsupported Claude models with a debug message", () => {
    const logs: string[] = [];
    const result = buildAnthropicEffortParams("claude-3-sonnet-20240229", { effortLevel: "high" }, {}, (m) => logs.push(m));
    expect(result).toEqual({});
    expect(logs[0]).toContain("does not support extended thinking");
  });
});
