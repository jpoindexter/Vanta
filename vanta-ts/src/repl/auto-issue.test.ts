import { describe, it, expect } from "vitest";
import {
  buildIssueDraft,
  autoIssueEnabled,
  newCancelWindow,
  tickCancelWindow,
  cancelWindow,
  buildGhIssueArgs,
  DEFAULT_ISSUE_LABELS,
  ISSUE_BODY_MAX,
  ISSUE_TITLE_MAX,
  type IssueContext,
} from "./auto-issue.js";

const ctx = (over: Partial<IssueContext> = {}): IssueContext => ({
  summary: "TypeError: cannot read 'x' of undefined in dispatchTool",
  errorSignal: "3 consecutive tool failures (shell_cmd)",
  recentTools: ["shell_cmd", "read_file", "shell_cmd"],
  gitState: "main (2 uncommitted files)",
  ...over,
});

describe("buildIssueDraft", () => {
  it("derives a concise title from the summary", () => {
    const d = buildIssueDraft(ctx());
    expect(d.title).toBe("TypeError: cannot read 'x' of undefined in dispatchTool");
    expect(d.title.length).toBeLessThanOrEqual(ISSUE_TITLE_MAX);
  });

  it("caps an overlong title and ellipsizes", () => {
    const d = buildIssueDraft(ctx({ summary: "x".repeat(500) }));
    expect(d.title.length).toBeLessThanOrEqual(ISSUE_TITLE_MAX);
    expect(d.title.endsWith("…")).toBe(true);
  });

  it("falls back to a default title when summary is empty", () => {
    expect(buildIssueDraft(ctx({ summary: "   " })).title).toBe("Recurring error (auto-filed)");
  });

  it("puts the failure context, recent tools, and git state in the body", () => {
    const d = buildIssueDraft(ctx());
    expect(d.body).toMatch(/## Summary/);
    expect(d.body).toMatch(/cannot read 'x'/);
    expect(d.body).toMatch(/## Error signal/);
    expect(d.body).toMatch(/3 consecutive tool failures/);
    expect(d.body).toMatch(/## Recent tool calls/);
    expect(d.body).toMatch(/- shell_cmd/);
    expect(d.body).toMatch(/- read_file/);
    expect(d.body).toMatch(/## Git state/);
    expect(d.body).toMatch(/main \(2 uncommitted files\)/);
  });

  it("uses placeholders for missing optional context", () => {
    const d = buildIssueDraft(ctx({ errorSignal: undefined, recentTools: undefined, gitState: undefined }));
    expect(d.body).toMatch(/Error signal\n\(none captured\)/);
    expect(d.body).toMatch(/Recent tool calls\n\(none\)/);
    expect(d.body).toMatch(/Git state\n\(unknown\)/);
  });

  it("applies the default labels", () => {
    expect(buildIssueDraft(ctx()).labels).toEqual([...DEFAULT_ISSUE_LABELS]);
    expect(buildIssueDraft(ctx()).labels).toEqual(["bug", "auto-filed"]);
  });

  it("returns a fresh labels array (not the shared constant)", () => {
    const d = buildIssueDraft(ctx());
    d.labels.push("mutated");
    expect(buildIssueDraft(ctx()).labels).toEqual(["bug", "auto-filed"]);
  });

  it("control-strips ANSI escapes and control bytes from title and body", () => {
    // Real ESC/NUL/BEL/BS bytes built from escapes so the source has no literal control bytes.
    const ESC = "\x1b";
    const dirty = `${ESC}[31mBOOM${ESC}[0m\x00\x07 crash\x08`;
    const d = buildIssueDraft(ctx({ summary: dirty, errorSignal: `${ESC}[1msignal${ESC}[0m\x00` }));
    expect(/[\x00-\x1f\x7f]/.test(d.title)).toBe(false);
    expect(d.title).toMatch(/BOOM crash/);
    // Body keeps newlines (\n) but no other control bytes / ANSI escapes.
    expect(/[\x00-\x09\x0b-\x1f\x7f]/.test(d.body)).toBe(false);
    expect(d.body).toMatch(/signal/);
  });

  it("caps a runaway body (multiple oversized fields combine past the limit)", () => {
    const big = "y".repeat(2000);
    const d = buildIssueDraft(ctx({
      summary: big,
      errorSignal: big,
      recentTools: Array.from({ length: 12 }, () => "z".repeat(200)),
      gitState: big,
    }));
    expect(d.body.length).toBeLessThanOrEqual(ISSUE_BODY_MAX);
    expect(d.body.endsWith("…")).toBe(true);
  });
});

describe("autoIssueEnabled", () => {
  it("is off by default (no env)", () => {
    expect(autoIssueEnabled({})).toBe(false);
  });
  it("stays off for any value other than '1'", () => {
    expect(autoIssueEnabled({ VANTA_AUTO_ISSUE: "0" })).toBe(false);
    expect(autoIssueEnabled({ VANTA_AUTO_ISSUE: "true" })).toBe(false);
    expect(autoIssueEnabled({ VANTA_AUTO_ISSUE: "" })).toBe(false);
  });
  it("is on only when explicitly '1'", () => {
    expect(autoIssueEnabled({ VANTA_AUTO_ISSUE: "1" })).toBe(true);
  });
});

describe("cancel window state machine", () => {
  it("counts down and fires at zero when not cancelled", () => {
    let s = newCancelWindow(1000);
    expect(s).toEqual({ remainingMs: 1000, cancelled: false, fired: false });
    s = tickCancelWindow(s, 400);
    expect(s).toMatchObject({ remainingMs: 600, fired: false });
    s = tickCancelWindow(s, 600);
    expect(s).toMatchObject({ remainingMs: 0, fired: true, cancelled: false });
  });

  it("fires when a single tick overshoots the remaining time", () => {
    const s = tickCancelWindow(newCancelWindow(500), 9999);
    expect(s).toMatchObject({ remainingMs: 0, fired: true });
  });

  it("cancelWindow marks cancelled, and a subsequent tick does NOT fire", () => {
    let s = newCancelWindow(300);
    s = cancelWindow(s);
    expect(s.cancelled).toBe(true);
    s = tickCancelWindow(s, 9999);
    expect(s.fired).toBe(false);
    expect(s.cancelled).toBe(true);
  });

  it("ESC at the last instant still prevents firing (cancel beats the final tick)", () => {
    let s = newCancelWindow(100);
    s = tickCancelWindow(s, 50); // remaining 50, not fired
    s = cancelWindow(s); // ESC
    s = tickCancelWindow(s, 50); // would have hit zero
    expect(s.fired).toBe(false);
  });

  it("is terminal once fired — never resurrects or cancels", () => {
    const fired = tickCancelWindow(newCancelWindow(0), 0);
    expect(fired.fired).toBe(true);
    expect(tickCancelWindow(fired, 100)).toBe(fired); // unchanged reference
    expect(cancelWindow(fired)).toBe(fired); // can't cancel a fired window
  });
});

describe("buildGhIssueArgs", () => {
  it("emits gh issue create argv with --title/--body and one --label per label", () => {
    const draft = { title: "Crash on launch", body: "details", labels: ["bug", "auto-filed"] };
    expect(buildGhIssueArgs(draft)).toEqual([
      "issue", "create",
      "--title", "Crash on launch",
      "--body", "details",
      "--label", "bug",
      "--label", "auto-filed",
    ]);
  });

  it("appends --repo when a target repo is given", () => {
    const args = buildGhIssueArgs({ title: "t", body: "b", labels: [] }, "owner/repo");
    expect(args).toEqual(["issue", "create", "--title", "t", "--body", "b", "--repo", "owner/repo"]);
  });

  it("passes title/body as separate argv items (no shell string injection)", () => {
    const draft = { title: "x; rm -rf /", body: "$(whoami) `id`", labels: [] };
    const args = buildGhIssueArgs(draft);
    // The dangerous values are discrete argv items, never concatenated into one shell string.
    expect(args[args.indexOf("--title") + 1]).toBe("x; rm -rf /");
    expect(args[args.indexOf("--body") + 1]).toBe("$(whoami) `id`");
    expect(args.some((a) => a.includes("--title x"))).toBe(false);
  });

  it("round-trips a real draft into argv", () => {
    const draft = buildIssueDraft(ctx());
    const args = buildGhIssueArgs(draft, "vanta/vanta");
    expect(args.slice(0, 2)).toEqual(["issue", "create"]);
    expect(args[args.indexOf("--title") + 1]).toBe(draft.title);
    expect(args.filter((a) => a === "--label")).toHaveLength(draft.labels.length);
    expect(args.at(-1)).toBe("vanta/vanta");
  });
});
