import { describe, it, expect } from "vitest";
import { classifyTaskKind, resolveAutoProvider, describeAutoRouter } from "./auto-router.js";

describe("classifyTaskKind", () => {
  it("classifies code tasks", () => {
    expect(classifyTaskKind("write a function to parse JSON")).toBe("code");
    expect(classifyTaskKind("debug this error")).toBe("code");
    expect(classifyTaskKind("refactor the auth module")).toBe("code");
  });

  it("classifies planning tasks", () => {
    expect(classifyTaskKind("plan the migration strategy")).toBe("plan");
    expect(classifyTaskKind("architect the new service")).toBe("plan");
  });

  it("classifies summarization tasks", () => {
    expect(classifyTaskKind("summarize this article")).toBe("summarize");
    expect(classifyTaskKind("give me a tldr")).toBe("summarize");
  });

  it("classifies classification tasks", () => {
    expect(classifyTaskKind("classify this email as spam or not")).toBe("classify");
    expect(classifyTaskKind("is this a bug or feature request?")).toBe("classify");
  });

  it("classifies vision tasks", () => {
    expect(classifyTaskKind("describe the screenshot")).toBe("vision");
    expect(classifyTaskKind("look at this image")).toBe("vision");
  });

  it("classifies title tasks", () => {
    expect(classifyTaskKind("generate a title for this doc")).toBe("title");
  });

  it("classifies research tasks", () => {
    expect(classifyTaskKind("search for the latest Node.js version")).toBe("research");
    expect(classifyTaskKind("what is the capital of France")).toBe("research");
  });

  it("returns generic for ambiguous tasks", () => {
    expect(classifyTaskKind("hello")).toBe("generic");
    expect(classifyTaskKind("continue")).toBe("generic");
  });
});

describe("resolveAutoProvider", () => {
  const BASE_ENV: NodeJS.ProcessEnv = {
    VANTA_PROVIDER: "openai",
    VANTA_MODEL: "gpt-4o-mini",
    OPENAI_API_KEY: "test-key",
  };

  it("uses the primary model when no overrides", () => {
    const p = resolveAutoProvider("hello", BASE_ENV);
    expect(p.modelId()).toBe("gpt-4o-mini");
  });

  it("applies code model override", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_CODE: "deepseek-coder" };
    const p = resolveAutoProvider("write a TypeScript parser", env);
    expect(p.modelId()).toBe("deepseek-coder");
  });

  it("applies classify model override", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_CLASSIFY: "gpt-4o-mini" };
    const p = resolveAutoProvider("classify this as spam", env);
    expect(p.modelId()).toBe("gpt-4o-mini");
  });

  it("falls back to tier routing when no kind override", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_EXPENSIVE: "gpt-4o" };
    const p = resolveAutoProvider("plan the system architecture", env);
    expect(p.modelId()).toBe("gpt-4o");
  });

  it("does not mutate the input env", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_CODE: "deepseek" };
    const frozen = { ...env };
    resolveAutoProvider("write code", env);
    expect(env).toEqual(frozen);
  });
});

describe("describeAutoRouter", () => {
  it("returns no-config message when bare", () => {
    const desc = describeAutoRouter({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "x" });
    expect(desc).toContain("no routing overrides");
  });

  it("lists configured overrides", () => {
    const env = {
      VANTA_PROVIDER: "openai", OPENAI_API_KEY: "x",
      VANTA_MODEL_CODE: "deepseek-coder",
      VANTA_MODEL_CHEAP: "gpt-4o-mini",
    };
    const desc = describeAutoRouter(env);
    expect(desc).toContain("code");
    expect(desc).toContain("deepseek-coder");
    expect(desc).toContain("cheap");
  });
});
