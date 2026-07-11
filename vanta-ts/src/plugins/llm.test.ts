import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginLlmLane } from "./llm.js";
import type { LLMProvider } from "../providers/interface.js";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

describe("plugin LLM lane", () => {
  it("uses the host provider, enforces budget, and writes attributed audit without secrets", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-plugin-llm-"));
    const provider: LLMProvider = {
      modelId: () => "gpt-4o-mini", contextWindow: () => 1000,
      complete: async () => ({ text: "host answer", toolCalls: [], finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10 } }),
    };
    const lane = createPluginLlmLane({ plugin: "reporter", dataDir: dir, provider: () => provider, hostBudgetUsd: 0.01 });
    expect((await lane.complete({ purpose: "summarize status", prompt: "secret-token-in-prompt", budgetUsd: 0.005, timeoutMs: 1000, maxTokens: 20 })).text).toBe("host answer");
    const audit = await readFile(join(dir, "plugin-llm-audit.jsonl"), "utf8");
    expect(audit).toContain('"plugin":"reporter"');
    expect(audit).toContain('"purpose":"summarize status"');
    expect(audit).not.toContain("secret-token-in-prompt");
    await expect(lane.complete({ purpose: "overspend", prompt: "x", budgetUsd: 1, timeoutMs: 1000, maxTokens: 20 })).rejects.toThrow("host cap");
  });

  it("parses and validates structured generation", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-plugin-llm-"));
    const provider: LLMProvider = {
      modelId: () => "local", contextWindow: () => 1000,
      complete: async () => ({ text: '{"status":"ok"}', toolCalls: [], finishReason: "stop" }),
    };
    const lane = createPluginLlmLane({ plugin: "reporter", dataDir: dir, provider: () => provider, hostBudgetUsd: 0.01 });
    const value = await lane.completeStructured({
      purpose: "status object", prompt: "status", budgetUsd: 0.002, timeoutMs: 1000, maxTokens: 20,
      schema: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
    });
    expect(value).toEqual({ status: "ok" });
  });
});
