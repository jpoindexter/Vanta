import { describe, it, expect } from "vitest";
import {
  classifyPrompt,
  augmentPrompt,
  resolveTemplatesConfig,
  maybeAugmentPrompt,
  DEFAULT_TEMPLATES,
  type Template,
} from "./templates.js";

describe("classifyPrompt", () => {
  it("classifies a bug-fix request as fix-bug", () => {
    expect(classifyPrompt("fix the bug in the parser")).toBe("fix-bug");
    expect(classifyPrompt("debug the crash on startup")).toBe("fix-bug");
  });

  it("classifies a test-writing request as write-test", () => {
    expect(classifyPrompt("write a test for the auth helper")).toBe("write-test");
    expect(classifyPrompt("add unit tests for the reducer")).toBe("write-test");
  });

  it("classifies a refactor request as refactor", () => {
    expect(classifyPrompt("refactor this module to be smaller")).toBe("refactor");
    expect(classifyPrompt("clean up the duplicated logic")).toBe("refactor");
  });

  it("classifies a feature request as add-feature", () => {
    expect(classifyPrompt("add a feature to export to CSV")).toBe("add-feature");
    expect(classifyPrompt("implement a new endpoint for search")).toBe("add-feature");
  });

  it("classifies a review request as review", () => {
    expect(classifyPrompt("review this pull request")).toBe("review");
    expect(classifyPrompt("do a code review of my changes")).toBe("review");
  });

  it("returns null for an unmatched prose prompt", () => {
    expect(classifyPrompt("what is the capital of France?")).toBeNull();
    expect(classifyPrompt("summarize the latest meeting notes")).toBeNull();
  });
});

describe("augmentPrompt", () => {
  it("prepends fix-bug context to a bug-fix prompt", () => {
    const out = augmentPrompt("fix the bug in x");
    expect(out).toContain("[template:fix-bug]");
    expect(out).toContain("reproduce first");
    expect(out).toContain("fix the bug in x");
  });

  it("prepends write-test context to a test prompt", () => {
    const out = augmentPrompt("write a test for y");
    expect(out).toContain("[template:write-test]");
    expect(out).toContain("arrange-act-assert");
    expect(out).toContain("write a test for y");
  });

  it("returns the message unchanged when nothing matches", () => {
    const msg = "summarize the latest meeting notes";
    expect(augmentPrompt(msg)).toBe(msg);
  });

  it("is idempotent — does not double-inject when a block is already present", () => {
    const once = augmentPrompt("fix the bug in x");
    const twice = augmentPrompt(once);
    expect(twice).toBe(once);
    expect(twice.match(/\[template:/g)?.length).toBe(1);
  });

  it("accepts a custom catalog", () => {
    const catalog: Template[] = [
      { id: "deploy", label: "Deploy", match: /\bdeploy\b/i, context: "check the rollback plan first." },
    ];
    expect(classifyPrompt("deploy the app", catalog)).toBe("deploy");
    expect(augmentPrompt("deploy the app", catalog)).toContain("[template:deploy]");
  });
});

describe("resolveTemplatesConfig", () => {
  it("is OFF by default (unset env)", () => {
    expect(resolveTemplatesConfig({}).enabled).toBe(false);
  });

  it("enables on 1/true/on (case-insensitive)", () => {
    expect(resolveTemplatesConfig({ VANTA_TEMPLATES: "1" }).enabled).toBe(true);
    expect(resolveTemplatesConfig({ VANTA_TEMPLATES: "true" }).enabled).toBe(true);
    expect(resolveTemplatesConfig({ VANTA_TEMPLATES: "ON" }).enabled).toBe(true);
  });

  it("stays OFF for any other value", () => {
    expect(resolveTemplatesConfig({ VANTA_TEMPLATES: "0" }).enabled).toBe(false);
    expect(resolveTemplatesConfig({ VANTA_TEMPLATES: "no" }).enabled).toBe(false);
  });
});

describe("maybeAugmentPrompt", () => {
  it("never augments when disabled", () => {
    const msg = "fix the bug in x";
    expect(maybeAugmentPrompt(msg, {})).toBe(msg);
  });

  it("augments a matched prompt when enabled", () => {
    const out = maybeAugmentPrompt("fix the bug in x", { VANTA_TEMPLATES: "1" });
    expect(out).toContain("[template:fix-bug]");
  });

  it("leaves an unmatched prompt unchanged even when enabled", () => {
    const msg = "summarize the latest meeting notes";
    expect(maybeAugmentPrompt(msg, { VANTA_TEMPLATES: "1" })).toBe(msg);
  });

  it("ships a catalog covering the five core patterns", () => {
    const ids = DEFAULT_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(["fix-bug", "write-test", "refactor", "add-feature", "review"]),
    );
  });
});
