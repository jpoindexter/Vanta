import { describe, it, expect } from "vitest";
import { extractSessionTitle, applyHookTitle, MAX_TITLE_LENGTH } from "./hook-session-title.js";

describe("extractSessionTitle", () => {
  it("returns the sessionTitle string when present", () => {
    expect(extractSessionTitle({ sessionTitle: "Refactor auth" })).toBe("Refactor auth");
  });

  it("trims surrounding whitespace and collapses internal runs", () => {
    expect(extractSessionTitle({ sessionTitle: "  fix   the   bug  " })).toBe("fix the bug");
  });

  it("caps an over-long title to MAX_TITLE_LENGTH with an ellipsis", () => {
    const long = "a".repeat(120);
    const out = extractSessionTitle({ sessionTitle: long });
    expect(out).not.toBeNull();
    expect(out!.length).toBe(MAX_TITLE_LENGTH);
    expect(out!.endsWith("...")).toBe(true);
  });

  it("returns null when sessionTitle is missing", () => {
    expect(extractSessionTitle({})).toBeNull();
    expect(extractSessionTitle({ other: "x" })).toBeNull();
  });

  it("returns null when sessionTitle is blank or whitespace-only", () => {
    expect(extractSessionTitle({ sessionTitle: "" })).toBeNull();
    expect(extractSessionTitle({ sessionTitle: "   " })).toBeNull();
  });

  it("returns null when sessionTitle is not a string", () => {
    expect(extractSessionTitle({ sessionTitle: 42 })).toBeNull();
    expect(extractSessionTitle({ sessionTitle: true })).toBeNull();
    expect(extractSessionTitle({ sessionTitle: { a: 1 } })).toBeNull();
    expect(extractSessionTitle({ sessionTitle: ["x"] })).toBeNull();
  });

  it("returns null for non-object output (null/array/string/number)", () => {
    expect(extractSessionTitle(null)).toBeNull();
    expect(extractSessionTitle(undefined)).toBeNull();
    expect(extractSessionTitle("a string")).toBeNull();
    expect(extractSessionTitle(7)).toBeNull();
    expect(extractSessionTitle(["sessionTitle"])).toBeNull();
  });
});

describe("applyHookTitle", () => {
  it("returns the new title when the hook provides one", () => {
    expect(applyHookTitle("old", { sessionTitle: "new" })).toBe("new");
  });

  it("trims and caps the applied title", () => {
    expect(applyHookTitle("old", { sessionTitle: "  spaced  " })).toBe("spaced");
  });

  it("leaves the current title unchanged when no sessionTitle is provided", () => {
    expect(applyHookTitle("keep me", {})).toBe("keep me");
    expect(applyHookTitle("keep me", { sessionTitle: "  " })).toBe("keep me");
    expect(applyHookTitle("keep me", null)).toBe("keep me");
    expect(applyHookTitle("keep me", "not an object")).toBe("keep me");
  });
});
