import { describe, it, expect } from "vitest";
import {
  rateLimitText,
  resetHint,
  lineDeltaText,
  sessionNameText,
  worktreeText,
  vimText,
  customText,
  prText,
  outputStyleText,
  compactingText,
  composeRichSegments,
} from "./status-segments.js";

describe("rateLimitText", () => {
  it("omits when no rate-limit data is available", () => {
    expect(rateLimitText(undefined)).toBe("");
  });
  it("renders 5h + 7d bars with percentages", () => {
    const t = rateLimitText({ pct5h: 22, pct7d: 9 });
    expect(t).toContain("5h [");
    expect(t).toContain("22%");
    expect(t).toContain("7d [");
    expect(t).toContain("9%");
  });
  it("clamps out-of-range percentages to 0..100", () => {
    expect(rateLimitText({ pct5h: 250, pct7d: -5 })).toContain("100%");
    expect(rateLimitText({ pct5h: 250, pct7d: -5 })).toContain("0%");
  });
  it("appends a reset hint when resetsAt is present", () => {
    const iso = new Date(2026, 5, 19, 14, 30).toISOString();
    expect(rateLimitText({ pct5h: 10, pct7d: 5, resetsAt: iso })).toContain("↻14:30");
  });
});

describe("resetHint", () => {
  it("is empty without a timestamp", () => {
    expect(resetHint(undefined)).toBe("");
  });
  it("is empty for an unparseable timestamp", () => {
    expect(resetHint("not-a-date")).toBe("");
  });
  it("formats HH:MM in local time", () => {
    const iso = new Date(2026, 0, 1, 9, 5).toISOString();
    expect(resetHint(iso)).toBe(" ↻09:05");
  });
});

describe("lineDeltaText", () => {
  it("omits when there are no changes", () => {
    expect(lineDeltaText(undefined)).toBe("");
    expect(lineDeltaText({ added: 0, removed: 0 })).toBe("");
  });
  it("formats +added/-removed", () => {
    expect(lineDeltaText({ added: 42, removed: 7 })).toBe("+42/-7");
  });
  it("renders when only one side is non-zero", () => {
    expect(lineDeltaText({ added: 3, removed: 0 })).toBe("+3/-0");
  });
});

describe("sessionNameText", () => {
  it("omits when unset or blank", () => {
    expect(sessionNameText(undefined)).toBe("");
    expect(sessionNameText("   ")).toBe("");
  });
  it("passes through a short name", () => {
    expect(sessionNameText("auth-refactor")).toBe("auth-refactor");
  });
  it("clips an over-long name with an ellipsis", () => {
    const out = sessionNameText("a".repeat(40));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(24);
  });
});

describe("worktreeText", () => {
  it("omits when not in a worktree", () => {
    expect(worktreeText(false)).toBe("");
    expect(worktreeText(undefined)).toBe("");
  });
  it("shows the worktree tag when in one", () => {
    expect(worktreeText(true)).toBe("⑂ worktree");
  });
});

describe("vimText", () => {
  it("omits when vi-mode is off", () => {
    expect(vimText(false)).toBe("");
    expect(vimText(undefined)).toBe("");
  });
  it("shows vim when on", () => {
    expect(vimText(true)).toBe("vim");
  });
});

describe("customText", () => {
  it("omits empty/blank custom segments", () => {
    expect(customText(undefined)).toBe("");
    expect(customText("   ")).toBe("");
  });
  it("collapses whitespace and trims", () => {
    expect(customText("  on   call  ")).toBe("on call");
  });
  it("clips a long custom segment", () => {
    const out = customText("x".repeat(60));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(40);
  });
});

describe("outputStyleText", () => {
  it("omits unset and normal style", () => {
    expect(outputStyleText(undefined)).toBe("");
    expect(outputStyleText("normal")).toBe("");
  });
  it("shows non-default styles", () => {
    expect(outputStyleText("concise")).toBe("style:concise");
  });
});

describe("compactingText", () => {
  it("omits when no compaction is active", () => {
    expect(compactingText(false)).toBe("");
    expect(compactingText(undefined)).toBe("");
  });
  it("shows the active compaction state", () => {
    expect(compactingText(true)).toBe("compacting…");
  });
});

describe("prText", () => {
  it("omits when there is no active PR (default footer unchanged)", () => {
    expect(prText(undefined, "https://github.com/o/r/pull/{PR}")).toBe("");
  });
  it("omits when there is no template", () => {
    expect(prText(42, undefined)).toBe("");
    expect(prText(42, "   ")).toBe("");
  });
  it("renders the PR via the template's {PR} placeholder", () => {
    expect(prText(42, "https://github.com/o/r/pull/{PR}")).toBe(
      "https://github.com/o/r/pull/42",
    );
  });
});

describe("composeRichSegments", () => {
  it("returns no segments when nothing is present", () => {
    expect(composeRichSegments({})).toEqual([]);
  });
  it("includes only the segments whose data is present, in order", () => {
    const segs = composeRichSegments({
      lineDelta: { added: 5, removed: 2 },
      sessionName: "demo",
      isWorktree: true,
      vimEnabled: true,
    });
    expect(segs.map((s) => s.key)).toEqual(["delta", "name", "worktree", "vim"]);
  });
  it("omits the rate-limit segment cleanly when absent (no fabrication)", () => {
    const segs = composeRichSegments({ isWorktree: true });
    expect(segs.some((s) => s.key === "rate")).toBe(false);
    expect(segs).toHaveLength(1);
  });
  it("includes the rate-limit segment when data is supplied", () => {
    const segs = composeRichSegments({ rateLimit: { pct5h: 30, pct7d: 12 } });
    expect(segs.some((s) => s.key === "rate")).toBe(true);
  });
  it("includes a hook-contributed custom segment", () => {
    const segs = composeRichSegments({ custom: "deploying" });
    expect(segs.find((s) => s.key === "custom")?.text).toContain("deploying");
  });
  it("omits the PR segment when unset (default footer unchanged)", () => {
    expect(composeRichSegments({ prUrlTemplate: "pull/{PR}" }).some((s) => s.key === "pr")).toBe(false);
    expect(composeRichSegments({ prNumber: 5 }).some((s) => s.key === "pr")).toBe(false);
  });
  it("includes the PR segment when both number and template are present", () => {
    const segs = composeRichSegments({ prNumber: 5, prUrlTemplate: "pull/{PR}" });
    expect(segs.find((s) => s.key === "pr")?.text).toContain("pull/5");
  });
  it("includes the output style segment when non-default", () => {
    const segs = composeRichSegments({ outputStyle: "verbose" });
    expect(segs.find((s) => s.key === "style")?.text).toContain("style:verbose");
  });
  it("includes the compacting segment with high priority while active", () => {
    const segs = composeRichSegments({ compacting: true });
    expect(segs.find((s) => s.key === "compacting")).toMatchObject({
      text: "  ·  compacting…",
      priority: 8,
    });
  });
  it("prefixes each present segment with a separator", () => {
    const segs = composeRichSegments({ vimEnabled: true });
    expect(segs[0]!.text.startsWith("  ·  ")).toBe(true);
  });
});
