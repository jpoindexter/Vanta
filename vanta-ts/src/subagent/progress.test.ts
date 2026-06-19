import { describe, it, expect } from "vitest";
import {
  dueForUpdate,
  isVague,
  specificHint,
  SUMMARY_INTERVAL_MS,
  toSummary,
  type RecentCall,
} from "./progress.js";

describe("specificHint", () => {
  it("names the file basename for a write/edit call", () => {
    const calls: RecentCall[] = [{ name: "edit_file", args: { path: "src/features/auth/auth.ts" } }];
    expect(specificHint(calls)).toBe("Editing auth.ts");
  });

  it("prefers the most recent nameable call", () => {
    const calls: RecentCall[] = [
      { name: "read_file", args: { path: "README.md" } },
      { name: "shell_cmd", args: { command: "npm test" } },
    ];
    expect(specificHint(calls)).toBe("Running npm");
  });

  it("falls back to a generic verb for unknown tools but keeps the target", () => {
    expect(specificHint([{ name: "gmail_search", args: { query: "invoices" } }])).toBe("Working invoices");
  });

  it("returns null when no call carries a nameable target", () => {
    expect(specificHint([{ name: "inspect_state", args: {} }])).toBeNull();
    expect(specificHint([])).toBeNull();
  });

  it("truncates an over-long target token", () => {
    const long = "a".repeat(40);
    const hint = specificHint([{ name: "read_file", args: { path: long } }]);
    expect(hint).toBe(`Reading ${"a".repeat(23)}…`);
  });
});

describe("isVague", () => {
  it("flags a single generic word", () => {
    expect(isVague("thinking")).toBe(true);
    expect(isVague("")).toBe(true);
  });
  it("accepts a specific phrase", () => {
    expect(isVague("Editing auth.ts")).toBe(false);
  });
});

describe("toSummary", () => {
  it("clips a long raw reply to at most five words", () => {
    const out = toSummary("Refactoring the auth module and updating the tests");
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(5);
    expect(out.startsWith("Refactoring the auth")).toBe(true);
  });

  it("strips wrapping quotes and trailing punctuation", () => {
    expect(toSummary('"Editing the login flow."')).toBe("Editing the login flow");
  });

  it("uses the fallback hint when the raw reply is vague", () => {
    expect(toSummary("working", "Editing auth.ts")).toBe("Editing auth.ts");
  });

  it("uses the fallback hint when the raw reply is too short", () => {
    expect(toSummary("ok", "Reading README.md")).toBe("Reading README.md");
  });

  it("keeps the raw summary when it is specific enough and no hint is given", () => {
    expect(toSummary("Updating the status bar")).toBe("Updating the status bar");
  });

  it("never exceeds the char cap", () => {
    const out = toSummary("Implementing a very long descriptive progress phrase here");
    expect(out.length).toBeLessThanOrEqual(40);
  });
});

describe("dueForUpdate", () => {
  it("fires on the first tick (no prior update)", () => {
    expect(dueForUpdate(null, 1_000)).toBe(true);
  });
  it("throttles within the interval", () => {
    expect(dueForUpdate(1_000, 1_000 + SUMMARY_INTERVAL_MS - 1)).toBe(false);
  });
  it("fires once the interval has elapsed", () => {
    expect(dueForUpdate(1_000, 1_000 + SUMMARY_INTERVAL_MS)).toBe(true);
  });
});
