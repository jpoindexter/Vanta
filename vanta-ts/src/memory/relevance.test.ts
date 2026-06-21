import { describe, it, expect } from "vitest";
import {
  classifyMemory,
  shouldStoreDurably,
  buildRelevancePrompt,
  parseRelevanceSelection,
  relevanceEnabled,
  selectRelevantMemories,
  type MemoryFile,
} from "./relevance.js";

describe("classifyMemory", () => {
  it("marks short noise as non-durable", () => {
    const r = classifyMemory("ok");
    expect(r.durable).toBe(false);
    expect(r.class).toBe("noise");
  });

  it("marks conversational filler as noise", () => {
    expect(classifyMemory("sure").durable).toBe(false);
    expect(classifyMemory("thanks a lot").durable).toBe(false);
    expect(classifyMemory("ok great").durable).toBe(false);
  });

  it("flags sensitive data as non-durable", () => {
    const r = classifyMemory("my api key is sk-abc123");
    expect(r.class).toBe("sensitive");
    expect(r.durable).toBe(false);
  });

  it("flags password mentions as sensitive", () => {
    expect(classifyMemory("the password is hunter2").class).toBe("sensitive");
  });

  it("classifies user preferences as durable", () => {
    const r = classifyMemory("I prefer single quotes in TypeScript");
    expect(r.class).toBe("durable-preference");
    expect(r.durable).toBe(true);
  });

  it("classifies always/never rules as constraints", () => {
    const r = classifyMemory("never push to main without approval");
    expect(r.class).toBe("durable-constraint");
    expect(r.durable).toBe(true);
  });

  it("classifies corrections as durable", () => {
    const r = classifyMemory("no, that's wrong — always use zod at API boundaries");
    expect(r.class).toBe("correction");
    expect(r.durable).toBe(true);
  });

  it("classifies recurring workflows as durable", () => {
    const r = classifyMemory("every time before deploy, run npm test and typecheck");
    expect(r.class).toBe("recurring-workflow");
    expect(r.durable).toBe(true);
  });

  it("classifies identity facts as durable", () => {
    const r = classifyMemory("my company is Theft Studio based in Valencia");
    expect(r.class).toBe("durable-fact");
    expect(r.durable).toBe(true);
  });

  it("classifies project state as non-durable (stales quickly)", () => {
    const r = classifyMemory("currently building the EF-TASKSTACK feature");
    expect(r.class).toBe("project-state");
    expect(r.durable).toBe(false);
  });

  it("classifies long unmatched text as ephemeral-detail", () => {
    const r = classifyMemory("a very long string that has no special markers but is definitely longer than eighty characters");
    expect(r.class).toBe("ephemeral-detail");
    expect(r.durable).toBe(false);
  });

  it("returns a reason string on every result", () => {
    const cases = [
      "ok", "my api key is x", "I prefer dark mode",
      "never commit secrets", "wrong, use zod instead",
      "every time I deploy I run tests",
      "my project uses TypeScript and Node",
      "currently working on the dashboard",
      "a very long string that has no special markers but is definitely longer than eighty characters",
    ];
    for (const c of cases) {
      const r = classifyMemory(c);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("shouldStoreDurably", () => {
  it("returns true for preferences", () => {
    expect(shouldStoreDurably("I like using pnpm over npm")).toBe(true);
  });
  it("returns false for noise", () => {
    expect(shouldStoreDurably("ok")).toBe(false);
  });
  it("returns false for sensitive data", () => {
    expect(shouldStoreDurably("my token is abc")).toBe(false);
  });
});

// VANTA-MEM-RELEVANCE-LLM — per-turn memory-file selection via a cheap-model
// side-query. No real LLM: the cheap-model call is injected.

const FILES: MemoryFile[] = [
  { name: "1.md", summary: "the Vanta kernel project" },
  { name: "2.md", summary: "personal site work" },
  { name: "3.md" },
];
const VALID = FILES.map((f) => f.name);

describe("buildRelevancePrompt", () => {
  it("references the turn text and every file name", () => {
    const prompt = buildRelevancePrompt("fix the kernel risk classifier", FILES);
    expect(prompt).toContain("fix the kernel risk classifier");
    for (const f of FILES) expect(prompt).toContain(f.name);
  });

  it("includes the summary when present", () => {
    const prompt = buildRelevancePrompt("anything", FILES);
    expect(prompt).toContain("the Vanta kernel project");
  });

  it("asks for a JSON array of names", () => {
    const prompt = buildRelevancePrompt("x", FILES);
    expect(prompt.toLowerCase()).toContain("json array");
  });

  it("handles an empty file list without throwing", () => {
    const prompt = buildRelevancePrompt("hello", []);
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("hello");
  });

  it("handles empty turn text", () => {
    const prompt = buildRelevancePrompt("   ", FILES);
    expect(prompt).toContain("(empty)");
  });
});

describe("parseRelevanceSelection", () => {
  it("keeps only names that are in validNames", () => {
    const r = parseRelevanceSelection('["1.md", "3.md"]', VALID);
    expect(r).toEqual(["1.md", "3.md"]);
  });

  it("drops hallucinated names not in validNames", () => {
    const r = parseRelevanceSelection('["1.md", "99.md", "ghost.md"]', VALID);
    expect(r).toEqual(["1.md"]);
  });

  it("tolerates a ```json fence", () => {
    const r = parseRelevanceSelection('```json\n["2.md"]\n```', VALID);
    expect(r).toEqual(["2.md"]);
  });

  it("tolerates a bare ``` fence", () => {
    const r = parseRelevanceSelection('```\n["2.md"]\n```', VALID);
    expect(r).toEqual(["2.md"]);
  });

  it("tolerates surrounding prose around the array", () => {
    const r = parseRelevanceSelection(
      'Sure, the relevant files are: ["1.md", "2.md"]. Done.',
      VALID,
    );
    expect(r).toEqual(["1.md", "2.md"]);
  });

  it("dedups repeated names", () => {
    const r = parseRelevanceSelection('["1.md", "1.md"]', VALID);
    expect(r).toEqual(["1.md"]);
  });

  it("returns [] on non-array JSON", () => {
    expect(parseRelevanceSelection('{"name":"1.md"}', VALID)).toEqual([]);
  });

  it("returns [] on garbage", () => {
    expect(parseRelevanceSelection("not json at all", VALID)).toEqual([]);
    expect(parseRelevanceSelection("", VALID)).toEqual([]);
  });

  it("returns [] when nothing matches validNames", () => {
    expect(parseRelevanceSelection('["x.md", "y.md"]', VALID)).toEqual([]);
  });

  it("ignores non-string array entries", () => {
    const r = parseRelevanceSelection('["1.md", 42, null, true]', VALID);
    expect(r).toEqual(["1.md"]);
  });
});

describe("relevanceEnabled", () => {
  it("is off by default (preserves current behavior)", () => {
    expect(relevanceEnabled({})).toBe(false);
  });
  it("is on with VANTA_MEM_RELEVANCE=1", () => {
    expect(relevanceEnabled({ VANTA_MEM_RELEVANCE: "1" })).toBe(true);
  });
  it("ignores other truthy-ish values", () => {
    expect(relevanceEnabled({ VANTA_MEM_RELEVANCE: "true" })).toBe(false);
    expect(relevanceEnabled({ VANTA_MEM_RELEVANCE: "0" })).toBe(false);
  });
});

describe("selectRelevantMemories", () => {
  const fallback = VALID;
  const ON = { VANTA_MEM_RELEVANCE: "1" } as NodeJS.ProcessEnv;
  const OFF = {} as NodeJS.ProcessEnv;

  it("returns the fallback when disabled (no call made)", async () => {
    let called = false;
    const r = await selectRelevantMemories(
      "fix the kernel",
      FILES,
      {
        complete: async () => {
          called = true;
          return '["1.md"]';
        },
        fallback,
      },
      OFF,
    );
    expect(r).toEqual(fallback);
    expect(called).toBe(false);
  });

  it("returns the parsed selection when enabled and the call succeeds", async () => {
    const r = await selectRelevantMemories(
      "fix the kernel",
      FILES,
      { complete: async () => '["1.md", "3.md"]', fallback },
      ON,
    );
    expect(r).toEqual(["1.md", "3.md"]);
  });

  it("passes the side-query prompt (turn + names) to the injected call", async () => {
    let seen = "";
    await selectRelevantMemories(
      "personal site tweak",
      FILES,
      {
        complete: async (prompt) => {
          seen = prompt;
          return '["2.md"]';
        },
        fallback,
      },
      ON,
    );
    expect(seen).toContain("personal site tweak");
    expect(seen).toContain("2.md");
  });

  it("returns the fallback when the call throws", async () => {
    const r = await selectRelevantMemories(
      "x",
      FILES,
      {
        complete: async () => {
          throw new Error("cheap model down");
        },
        fallback,
      },
      ON,
    );
    expect(r).toEqual(fallback);
  });

  it("returns the fallback when the selection is empty", async () => {
    const r = await selectRelevantMemories(
      "x",
      FILES,
      { complete: async () => "[]", fallback },
      ON,
    );
    expect(r).toEqual(fallback);
  });

  it("returns the fallback when the selection is all hallucinated", async () => {
    const r = await selectRelevantMemories(
      "x",
      FILES,
      { complete: async () => '["ghost.md"]', fallback },
      ON,
    );
    expect(r).toEqual(fallback);
  });

  it("never throws — garbage response degrades to the fallback", async () => {
    const r = await selectRelevantMemories(
      "x",
      FILES,
      { complete: async () => "totally not json", fallback },
      ON,
    );
    expect(r).toEqual(fallback);
  });
});
