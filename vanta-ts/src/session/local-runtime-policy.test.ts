import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../providers/interface.js";
import {
  applyLocalRuntimeLimits,
  LOCAL_CODING_TOOLS,
  resolveSessionSystemPrompt,
  resolveSessionToolInclude,
} from "./local-runtime-policy.js";

describe("local runtime session policy", () => {
  const localRoute = { provider: "custom", model: "qwen", baseRoute: "http://127.0.0.1:8129/v1", billingMode: "local" as const };

  it("uses a compact coding surface for a local provider by default", () => {
    expect(resolveSessionToolInclude(undefined, localRoute, {})).toEqual(LOCAL_CODING_TOOLS);
  });

  it("preserves an explicit project allowlist", () => {
    expect(resolveSessionToolInclude(["read_file"], localRoute, {})).toEqual(["read_file"]);
  });

  it("keeps the full surface for remote providers or an explicit local override", () => {
    expect(resolveSessionToolInclude(undefined, { ...localRoute, billingMode: "metered" }, {})).toBeUndefined();
    expect(resolveSessionToolInclude(undefined, localRoute, { VANTA_LOCAL_FULL_TOOLS: "1" })).toBeUndefined();
  });

  it("compacts local instructions while retaining the active goal and project root", () => {
    const full = [
      "# Vanta\nfull stable instructions",
      "Project context:\n" + "repository detail ".repeat(4_000),
      "Project ID: project-1\n\nActive goals:\n- [7] Ship the local runtime",
    ].join("\n\n---\n\n");

    const compact = resolveSessionSystemPrompt(full, "/project", localRoute, {});

    expect(compact).toContain("You are Vanta");
    expect(compact).toContain("/project");
    expect(compact).toContain("Ship the local runtime");
    expect(compact).toContain("read AGENTS.md");
    expect(compact).toContain("exact absolute path");
    expect(compact).toContain("scoped approval");
    expect(compact).not.toContain("repository detail");
    expect(compact.length).toBeLessThan(3_000);
  });

  it("preserves the full prompt for remote routes or the explicit local override", () => {
    const full = "full prompt";
    expect(resolveSessionSystemPrompt(full, "/project", { ...localRoute, billingMode: "metered" }, {})).toBe(full);
    expect(resolveSessionSystemPrompt(full, "/project", localRoute, { VANTA_LOCAL_FULL_PROMPT: "1" })).toBe(full);
  });

  it("caps otherwise-unbounded local generations and preserves explicit budgets", async () => {
    const configs: unknown[] = [];
    const provider = {
      complete: async (_messages, _tools, config) => { configs.push(config); return { text: "ok", toolCalls: [], finishReason: "stop" }; },
      modelId: () => "qwen",
      contextWindow: () => 32_768,
      routeInfo: () => localRoute,
    } satisfies LLMProvider;
    const bounded = applyLocalRuntimeLimits(provider, {});

    await bounded.complete([], []);
    await bounded.complete([], [], { maxTokens: 77 });

    expect(configs).toEqual([{ maxTokens: 512 }, { maxTokens: 77 }]);
  });

  it("does not wrap remote providers or a disabled local limit", () => {
    const provider = {
      complete: async () => ({ text: "ok", toolCalls: [], finishReason: "stop" }),
      modelId: () => "remote",
      contextWindow: () => 32_768,
      routeInfo: () => ({ ...localRoute, billingMode: "metered" as const }),
    } satisfies LLMProvider;
    expect(applyLocalRuntimeLimits(provider, {})).toBe(provider);
    expect(applyLocalRuntimeLimits({ ...provider, routeInfo: () => localRoute }, { VANTA_LOCAL_MAX_TOKENS: "0" }).complete).toBe(provider.complete);
  });
});
