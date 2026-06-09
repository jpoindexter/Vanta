import { describe, it, expect } from "vitest";
import { classifyMemory, shouldStoreDurably } from "./relevance.js";

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
