import { describe, it, expect } from "vitest";
import {
  AUTO_MODE_AFFIRMATIVES,
  buildAutoModeExplanation,
  isAutoModeOptedIn,
  resolveAutoModeActivation,
  autoModeMayAutoApprove,
} from "./auto-mode-optin.js";

describe("AUTO_MODE_AFFIRMATIVES", () => {
  it("accepts a simple affirmative — y/yes/enable (lighter than bypass's token)", () => {
    expect(AUTO_MODE_AFFIRMATIVES).toContain("y");
    expect(AUTO_MODE_AFFIRMATIVES).toContain("yes");
    expect(AUTO_MODE_AFFIRMATIVES).toContain("enable");
  });
});

describe("buildAutoModeExplanation", () => {
  const text = buildAutoModeExplanation();

  it("names what auto-approves — the safe read-only set", () => {
    const lower = text.toLowerCase();
    expect(lower).toContain("auto-approve");
    expect(lower).toContain("read-only");
  });

  it("names what STILL prompts — writes/destructive/out-of-scope", () => {
    const lower = text.toLowerCase();
    expect(lower).toContain("write");
    expect(lower).toContain("destructive");
    expect(lower).toContain("out-of-scope");
    expect(lower).toContain("prompt");
  });

  it("reaffirms the kernel block floor is untouched", () => {
    const lower = text.toLowerCase();
    expect(lower).toContain("block");
    expect(lower).toContain("never");
  });

  it("tells the operator how to confirm and how to disable", () => {
    const lower = text.toLowerCase();
    expect(lower).toContain("enable");
    expect(lower).toContain("off");
  });
});

describe("isAutoModeOptedIn — the simple affirmative gate", () => {
  it("returns true for y/yes/enable", () => {
    expect(isAutoModeOptedIn("y")).toBe(true);
    expect(isAutoModeOptedIn("yes")).toBe(true);
    expect(isAutoModeOptedIn("enable")).toBe(true);
  });

  it("returns true case-insensitively and trimmed", () => {
    expect(isAutoModeOptedIn("Y")).toBe(true);
    expect(isAutoModeOptedIn("YES")).toBe(true);
    expect(isAutoModeOptedIn("  Enable  ")).toBe(true);
    expect(isAutoModeOptedIn("\tyes\n")).toBe(true);
  });

  it("returns false for an explicit no", () => {
    expect(isAutoModeOptedIn("n")).toBe(false);
    expect(isAutoModeOptedIn("no")).toBe(false);
    expect(isAutoModeOptedIn("N")).toBe(false);
  });

  it("returns false for empty / whitespace input", () => {
    expect(isAutoModeOptedIn("")).toBe(false);
    expect(isAutoModeOptedIn("   ")).toBe(false);
  });

  it("returns false for garbage / anything else", () => {
    expect(isAutoModeOptedIn("maybe")).toBe(false);
    expect(isAutoModeOptedIn("sure")).toBe(false);
    expect(isAutoModeOptedIn("enabled")).toBe(false);
    expect(isAutoModeOptedIn("yep")).toBe(false);
  });
});

describe("resolveAutoModeActivation — no opt-in means OFF", () => {
  it("activates only when requested AND opted-in", () => {
    expect(resolveAutoModeActivation(true, true)).toBe(true);
  });

  it("does NOT activate when requested but not opted-in", () => {
    expect(resolveAutoModeActivation(true, false)).toBe(false);
  });

  it("does NOT activate when opted-in but not requested", () => {
    expect(resolveAutoModeActivation(false, true)).toBe(false);
  });

  it("does NOT activate when neither", () => {
    expect(resolveAutoModeActivation(false, false)).toBe(false);
  });

  it("no opt-in → auto stays off (default), even with a request", () => {
    const requested = true;
    const optedIn = isAutoModeOptedIn(""); // empty answer never opts in
    expect(resolveAutoModeActivation(requested, optedIn)).toBe(false);
  });

  it("a real affirmative + request → auto activates", () => {
    const active = resolveAutoModeActivation(true, isAutoModeOptedIn("yes"));
    expect(active).toBe(true);
  });
});

describe("autoModeMayAutoApprove — the three security invariants", () => {
  it("auto-approves a safe ask (the classifier's safe set)", () => {
    expect(autoModeMayAutoApprove("ask", true)).toBe(true);
  });

  it("a risky/unsafe ask still PROMPTS — never auto-approved", () => {
    expect(autoModeMayAutoApprove("ask", false)).toBe(false);
  });

  it("treats allow as already-approved (classifier verdict irrelevant)", () => {
    expect(autoModeMayAutoApprove("allow", true)).toBe(true);
    expect(autoModeMayAutoApprove("allow", false)).toBe(true);
  });

  it("NEVER auto-approves a kernel block — the immovable floor", () => {
    expect(autoModeMayAutoApprove("block", true)).toBe(false);
    expect(autoModeMayAutoApprove("block", false)).toBe(false);
  });

  it("an activated auto mode still cannot auto-approve a block or an unsafe ask", () => {
    const active = resolveAutoModeActivation(true, isAutoModeOptedIn("enable"));
    expect(active).toBe(true);
    // Block stays immovable even when auto is fully active.
    expect(active && autoModeMayAutoApprove("block", true)).toBe(false);
    // An unsafe ask still prompts even when auto is fully active.
    expect(active && autoModeMayAutoApprove("ask", false)).toBe(false);
    // Only the classifier's safe ask is auto-approved.
    expect(active && autoModeMayAutoApprove("ask", true)).toBe(true);
  });
});
