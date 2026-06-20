import { describe, it, expect } from "vitest";
import {
  buildInterviewPrompt,
  parseQuestions,
  generateClarifyingQuestions,
  formatInterview,
  foldAnswersIntoPlan,
  resolveInterviewConfig,
  type InterviewProvider,
} from "./interview.js";
import type { CompletionResult } from "../providers/interface.js";

/** A provider whose reply is canned, recording the prompt it received. */
function fakeProvider(reply: string): InterviewProvider & { lastPrompt?: string } {
  const fake: InterviewProvider & { lastPrompt?: string } = {
    async complete(messages): Promise<CompletionResult> {
      fake.lastPrompt = String(messages[0]?.content ?? "");
      return { text: reply, toolCalls: [], finishReason: "stop" };
    },
  };
  return fake;
}

/** A provider that always throws, to exercise the fail-open path. */
const throwingProvider: InterviewProvider = {
  async complete(): Promise<CompletionResult> {
    throw new Error("provider down");
  },
};

describe("buildInterviewPrompt", () => {
  it("embeds the task verbatim", () => {
    const prompt = buildInterviewPrompt("Add a /tags command");
    expect(prompt).toContain("Add a /tags command");
  });

  it("instructs an empty list for already-specific tasks", () => {
    const prompt = buildInterviewPrompt("anything");
    expect(prompt.toLowerCase()).toContain("empty list");
    expect(prompt).toContain("JSON array");
  });
});

describe("parseQuestions", () => {
  it("parses a bare JSON array", () => {
    expect(parseQuestions('["Which DB?", "Auth?"]')).toEqual(["Which DB?", "Auth?"]);
  });

  it("parses a JSON array embedded in surrounding prose", () => {
    expect(parseQuestions('Sure:\n["Scope?"]\nthanks')).toEqual(["Scope?"]);
  });

  it("returns [] for an empty array, empty text, or non-JSON", () => {
    expect(parseQuestions("[]")).toEqual([]);
    expect(parseQuestions("")).toEqual([]);
    expect(parseQuestions("no json here")).toEqual([]);
    expect(parseQuestions("{not an array}")).toEqual([]);
  });

  it("drops blanks and caps at 4 questions", () => {
    const out = parseQuestions('["a","","b","c","d","e"]');
    expect(out).toEqual(["a", "b", "c", "d"]);
  });
});

describe("generateClarifyingQuestions", () => {
  it("returns parsed questions from the injected provider", async () => {
    const provider = fakeProvider('["Which platform?", "What budget?"]');
    const qs = await generateClarifyingQuestions("build a thing", { provider });
    expect(qs).toEqual(["Which platform?", "What budget?"]);
    expect(provider.lastPrompt).toContain("build a thing");
  });

  it("returns [] when the model deems the task already specific", async () => {
    const provider = fakeProvider("[]");
    const qs = await generateClarifyingQuestions(
      "Add a vitest test asserting parseQuestions caps at 4",
      { provider },
    );
    expect(qs).toEqual([]);
  });

  it("returns [] on provider error (fail open)", async () => {
    const qs = await generateClarifyingQuestions("anything", { provider: throwingProvider });
    expect(qs).toEqual([]);
  });

  it("returns [] for an empty task without calling the provider", async () => {
    let called = false;
    const provider: InterviewProvider = {
      async complete(): Promise<CompletionResult> {
        called = true;
        return { text: '["x"]', toolCalls: [], finishReason: "stop" };
      },
    };
    expect(await generateClarifyingQuestions("   ", { provider })).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("formatInterview", () => {
  it("renders the numbered clarifying block", () => {
    const block = formatInterview(["Which DB?", "Auth model?"]);
    expect(block).toContain("Before I plan this, I need to clarify:");
    expect(block).toContain("1. Which DB?");
    expect(block).toContain("2. Auth model?");
  });

  it("returns '' when there are no questions", () => {
    expect(formatInterview([])).toBe("");
  });
});

describe("foldAnswersIntoPlan", () => {
  it("includes both the questions and the answers", () => {
    const folded = foldAnswersIntoPlan("build the export", [
      { question: "Which format?", answer: "CSV" },
      { question: "How many rows?", answer: "up to 10k" },
    ]);
    expect(folded).toContain("build the export");
    expect(folded).toContain("Which format?");
    expect(folded).toContain("CSV");
    expect(folded).toContain("How many rows?");
    expect(folded).toContain("up to 10k");
  });

  it("marks unanswered questions explicitly", () => {
    const folded = foldAnswersIntoPlan("task", [{ question: "Scope?", answer: "  " }]);
    expect(folded).toContain("(no answer given)");
  });

  it("returns the bare task when there is no Q&A", () => {
    expect(foldAnswersIntoPlan("just the task", [])).toBe("just the task");
  });
});

describe("resolveInterviewConfig", () => {
  it("defaults to enabled", () => {
    expect(resolveInterviewConfig({})).toEqual({ enabled: true });
  });

  it("is disabled by 0/false/off/no", () => {
    for (const v of ["0", "false", "off", "no", "OFF"]) {
      expect(resolveInterviewConfig({ VANTA_PLAN_INTERVIEW: v })).toEqual({ enabled: false });
    }
  });

  it("stays enabled for any other value", () => {
    expect(resolveInterviewConfig({ VANTA_PLAN_INTERVIEW: "1" })).toEqual({ enabled: true });
  });
});
