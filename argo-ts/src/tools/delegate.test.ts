import { describe, it, expect } from "vitest";
import { delegateTool, delegateEnv } from "./delegate.js";
import type { ToolContext } from "./types.js";

// The zod-failure path returns before provider resolution / subagent spawn, so
// no real ctx, provider, or network is needed — the test stays fully offline.
const ctx = {} as ToolContext;

describe("delegateTool", () => {
  it("returns an actionable error when required args are missing", async () => {
    const result = await delegateTool.execute({ goal: "x" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("returns an actionable error when goal is an empty string", async () => {
    const result = await delegateTool.execute(
      { goal: "", instruction: "do the thing" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("rejects an out-of-range max_iterations before any spawn", async () => {
    const result = await delegateTool.execute(
      { goal: "g", instruction: "i", max_iterations: 99 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("describes delegation as a constant internal op, leaking no content", () => {
    const description = delegateTool.describeForSafety?.({
      goal: "delete all files",
      instruction: "rm -rf /",
    });

    expect(description).toBe("delegate a subtask to a worker agent");
  });
});

describe("delegateEnv", () => {
  it("overlays the worker's chosen provider + model over the parent env", () => {
    const out = delegateEnv(
      { VANTA_PROVIDER: "gemini", VANTA_MODEL: "gemini-2.5-flash", OPENAI_API_KEY: "k" },
      "ollama",
      "qwen2.5:14b",
    );
    expect(out.VANTA_PROVIDER).toBe("ollama");
    expect(out.VANTA_MODEL).toBe("qwen2.5:14b");
    expect(out.OPENAI_API_KEY).toBe("k"); // other env (keys) preserved
  });

  it("falls back to the parent's provider/model when none chosen", () => {
    const out = delegateEnv({ VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-4o" });
    expect(out.VANTA_PROVIDER).toBe("openai");
    expect(out.VANTA_MODEL).toBe("gpt-4o");
  });

  it("applies only the provider when model is omitted", () => {
    const out = delegateEnv({ VANTA_PROVIDER: "openai" }, "ollama");
    expect(out.VANTA_PROVIDER).toBe("ollama");
    expect(out.VANTA_MODEL).toBeUndefined();
  });
});
