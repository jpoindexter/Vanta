import { describe, expect, it, vi } from "vitest";
import {
  fallbackSuggestions,
  generatePromptSuggestions,
  normalizeSuggestions,
  promptSuggestionsEnabled,
} from "./prompt-suggestions.js";

describe("prompt suggestions", () => {
  it("is enabled by default and accepts common off values", () => {
    expect(promptSuggestionsEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(promptSuggestionsEnabled({ VANTA_PROMPT_SUGGESTIONS: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(promptSuggestionsEnabled({ VANTA_PROMPT_SUGGESTIONS: "off" } as NodeJS.ProcessEnv)).toBe(false);
    expect(promptSuggestionsEnabled({ VANTA_PROMPT_SUGGESTIONS: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("normalizes to exactly three unique one-line prompts", () => {
    expect(normalizeSuggestions(["  Run tests\nnow  ", "Run tests now", "Commit", "Push"])).toEqual([
      "Run tests now",
      "Commit",
      "Push",
    ]);
  });

  it("uses the provider side-query when it returns a JSON array", async () => {
    const provider = {
      complete: vi.fn(async () => ({
        text: JSON.stringify(["Verify the fix", "Show changed files", "Commit and push"]),
        toolCalls: [],
        finishReason: "stop",
      })),
    };
    await expect(generatePromptSuggestions({ userText: "fix bug", finalText: "done", provider })).resolves.toEqual([
      "Verify the fix",
      "Show changed files",
      "Commit and push",
    ]);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("falls back when the side-query fails", async () => {
    const provider = { complete: vi.fn(async () => { throw new Error("model down"); }) };
    const prompts = await generatePromptSuggestions({ userText: "roadmap", finalText: "next card", provider });
    expect(prompts).toHaveLength(3);
    expect(prompts.join(" ")).toContain("roadmap");
  });

  it("prefers failure-oriented fallback prompts after an error", () => {
    expect(fallbackSuggestions({ userText: "run", finalText: "error: failed" })[0]).toContain("Diagnose");
  });
});
