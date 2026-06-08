import { describe, it, expect } from "vitest";
import { selfEvalResponse, formatSelfEval } from "./self-eval.js";

describe("selfEvalResponse", () => {
  it("returns no flags for an empty response", () => {
    expect(selfEvalResponse("")).toHaveLength(0);
  });

  it("returns no flags for a short clean response", () => {
    expect(selfEvalResponse("The file has been read. Here are the results.")).toHaveLength(0);
  });

  it("flags unverified commitment for 'I'll implement this tomorrow'", () => {
    const flags = selfEvalResponse("I'll implement this tomorrow.");
    expect(flags.some((f) => f.includes("unverified commitment"))).toBe(true);
  });

  it("flags unverified commitment for 'I will fix this'", () => {
    const flags = selfEvalResponse("I will fix this for you.");
    expect(flags.some((f) => f.includes("unverified commitment"))).toBe(true);
  });

  it("does not flag commitment when tool proof is present", () => {
    const flags = selfEvalResponse("I'll implement this — Result: done ✓");
    expect(flags.some((f) => f.includes("unverified commitment"))).toBe(false);
  });

  it("flags completion claim for 'done, everything is complete'", () => {
    const flags = selfEvalResponse("done, everything is complete");
    expect(flags.some((f) => f.includes("completion claim"))).toBe(true);
  });

  it("flags completion claim for 'finished'", () => {
    const flags = selfEvalResponse("I finished the task.");
    expect(flags.some((f) => f.includes("completion claim"))).toBe(true);
  });

  it("does not flag completion claim when DONE: marker is present", () => {
    const flags = selfEvalResponse("DONE: shipped the feature");
    expect(flags.some((f) => f.includes("completion claim"))).toBe(false);
  });

  it("flags long unstructured response over 2000 chars without markdown", () => {
    const text = "x".repeat(2001);
    const flags = selfEvalResponse(text);
    expect(flags.some((f) => f.includes("long unstructured"))).toBe(true);
  });

  it("does not flag a short structured response for length", () => {
    const text = "## Summary\n- item one\n- item two";
    const flags = selfEvalResponse(text);
    expect(flags.some((f) => f.includes("long unstructured"))).toBe(false);
  });

  it("does not flag a long response that has markdown structure", () => {
    const text = "## Header\n" + "x".repeat(2100);
    const flags = selfEvalResponse(text);
    expect(flags.some((f) => f.includes("long unstructured"))).toBe(false);
  });

  it("flags hedged factual claim for 'I think'", () => {
    const flags = selfEvalResponse("I think the port is 3000.");
    expect(flags.some((f) => f.includes("hedged factual claim"))).toBe(true);
  });

  it("flags hedged factual claim for 'probably'", () => {
    const flags = selfEvalResponse("This is probably the correct approach.");
    expect(flags.some((f) => f.includes("hedged factual claim"))).toBe(true);
  });

  it("flags hedged factual claim for 'maybe'", () => {
    const flags = selfEvalResponse("Maybe the file is missing.");
    expect(flags.some((f) => f.includes("hedged factual claim"))).toBe(true);
  });
});

describe("formatSelfEval", () => {
  it("returns null for an empty flags array", () => {
    expect(formatSelfEval([])).toBeNull();
  });

  it("returns a string containing the flag text", () => {
    const result = formatSelfEval(["foo"]);
    expect(result).not.toBeNull();
    expect(result).toContain("foo");
  });

  it("joins multiple flags with ·", () => {
    const result = formatSelfEval(["foo", "bar"]);
    expect(result).toContain("foo");
    expect(result).toContain("bar");
    expect(result).toContain("·");
  });

  it("starts with the self-check prefix", () => {
    const result = formatSelfEval(["something"]);
    expect(result).toMatch(/⚑ self-check:/);
  });
});
