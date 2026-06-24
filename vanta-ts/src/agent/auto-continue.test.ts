import { describe, expect, it, vi } from "vitest";
import { looksUnfinished, shouldAutoContinue } from "./auto-continue.js";
import type { AgentDeps } from "./agent-types.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";

function provider(text = "YES complete"): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: vi.fn(async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" })),
  };
}

function deps(p: LLMProvider): AgentDeps {
  return { provider: p, safety: {}, registry: {}, root: "/tmp", requestApproval: async () => true, summarize: vi.fn() } as unknown as AgentDeps;
}

const res = (text: string): CompletionResult => ({ text, toolCalls: [], finishReason: "stop" });

/** Run fn with an env var temporarily set, restoring it after. */
async function withEnv(key: string, value: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.env[key];
  process.env[key] = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

describe("looksUnfinished", () => {
  it("flags text that announces more work", () => {
    expect(looksUnfinished("Step 1-2 done. Step 3-4 starts with the intake.")).toBe(true);
    expect(looksUnfinished("Next step: gather sources")).toBe(true);
    expect(looksUnfinished("- [ ] write the report")).toBe(true);
    expect(looksUnfinished("Let me now run the tests")).toBe(true);
    expect(looksUnfinished("I'll continue with the remaining items")).toBe(true);
  });
  it("does not flag a clean completion", () => {
    expect(looksUnfinished("Saved the profile. All three goals scored 9/10.")).toBe(false);
    expect(looksUnfinished("Here is the summary you asked for.")).toBe(false);
  });
});

describe("shouldAutoContinue", () => {
  const base = { messages: [] as Message[], autoContinues: 0, deps: deps(provider()) };

  it("continues when work was done and the text announces more", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("next step: intake"), toolNames: ["read_file"] })).toBe(true);
  });
  it("does NOT continue a pure answer (no tools ran this turn)", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("next step: intake"), toolNames: [] })).toBe(false);
  });
  it("does NOT force past a clarify ask", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("next step: intake"), toolNames: ["clarify"] })).toBe(false);
  });
  it("does NOT force past a question to the user", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("which scope do you want?"), toolNames: ["read_file"] })).toBe(false);
  });
  it("does NOT continue a clean completion (no signal, verify off)", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("Done. Saved."), toolNames: ["write_file"] })).toBe(false);
  });
  it("respects the per-turn cap", async () => {
    expect(await shouldAutoContinue({ ...base, result: res("next step"), toolNames: ["read_file"], autoContinues: 3 })).toBe(false);
  });
  it("is disabled by VANTA_AUTOCONTINUE=0", async () => {
    await withEnv("VANTA_AUTOCONTINUE", "0", async () => {
      expect(await shouldAutoContinue({ ...base, result: res("next step"), toolNames: ["read_file"] })).toBe(false);
    });
  });
});

describe("shouldAutoContinue verifier backstop (VANTA_VERIFY=1)", () => {
  // Verifier fires only on an explicit completion claim with no cheap unfinished signal.
  const messages: Message[] = [
    { role: "user", content: "do the multi-part task" },
    { role: "assistant", content: "All done and complete." },
  ];

  it("continues when the verifier says NO on a done-claim", async () => {
    await withEnv("VANTA_VERIFY", "1", async () => {
      const d = deps(provider("NO — only 2 of 5 items are done"));
      expect(await shouldAutoContinue({ result: res("All done and complete."), messages, autoContinues: 0, toolNames: ["write_file"], deps: d })).toBe(true);
    });
  });
  it("stops when the verifier says YES", async () => {
    await withEnv("VANTA_VERIFY", "1", async () => {
      const d = deps(provider("YES complete"));
      expect(await shouldAutoContinue({ result: res("All done and complete."), messages, autoContinues: 0, toolNames: ["write_file"], deps: d })).toBe(false);
    });
  });
});
