import { describe, expect, it } from "vitest";
import { resolvePostToolBlock } from "./continue-on-block.js";
import type { ShellHook } from "./shell-hooks.js";

// A minimal valid PostToolUse hook; the resolver only reads `continueOnBlock`.
const baseHook: ShellHook = { type: "shell", command: "true" };

describe("resolvePostToolBlock", () => {
  it("feeds the reason back and continues when continueOnBlock is true", () => {
    const hook: ShellHook = { ...baseHook, continueOnBlock: true };
    const r = resolvePostToolBlock(hook, "use a different file");
    expect(r.hardStop).toBe(false);
    expect(r.feedback).toBe("use a different file");
  });

  it("hard-stops with no feedback when the flag is absent (current behavior)", () => {
    const r = resolvePostToolBlock(baseHook, "rejected");
    expect(r.hardStop).toBe(true);
    expect(r.feedback).toBeUndefined();
  });

  it("hard-stops when continueOnBlock is explicitly false", () => {
    const hook: ShellHook = { ...baseHook, continueOnBlock: false };
    const r = resolvePostToolBlock(hook, "rejected");
    expect(r.hardStop).toBe(true);
    expect(r.feedback).toBeUndefined();
  });

  it("continues but carries no feedback when the reason is empty", () => {
    const hook: ShellHook = { ...baseHook, continueOnBlock: true };
    const r = resolvePostToolBlock(hook, "");
    expect(r.hardStop).toBe(false);
    expect(r.feedback).toBeUndefined();
  });

  it("continues but carries no feedback when the reason is blank whitespace", () => {
    const hook: ShellHook = { ...baseHook, continueOnBlock: true };
    const r = resolvePostToolBlock(hook, "   \n  ");
    expect(r.hardStop).toBe(false);
    expect(r.feedback).toBeUndefined();
  });

  it("trims surrounding whitespace from the fed-back reason", () => {
    const hook: ShellHook = { ...baseHook, continueOnBlock: true };
    const r = resolvePostToolBlock(hook, "  needs approval  ");
    expect(r.hardStop).toBe(false);
    expect(r.feedback).toBe("needs approval");
  });
});
