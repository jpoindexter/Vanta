import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { StatusBar, estimateTokens, formatCount, progressBar, formatDuration, tokenWarningLevel, tokenWarnFractions, tokenWarnDecor } from "./status-bar.js";

describe("status-bar helpers", () => {
  it("estimateTokens sums transcript + streaming at ~4 chars/token", () => {
    expect(estimateTokens([{ content: "x".repeat(40) }], "y".repeat(40))).toBe(20);
    expect(estimateTokens([{}, { content: undefined }])).toBe(0);
  });

  it("formatCount abbreviates k and M", () => {
    expect(formatCount(38_000)).toBe("38k");
    expect(formatCount(1_000_000)).toBe("1.0M");
    expect(formatCount(512)).toBe("512");
  });

  it("progressBar clamps to width and reports percent", () => {
    expect(progressBar(50, 100, 8)).toEqual({ bar: "[████░░░░]", pct: 50 });
    expect(progressBar(999, 100, 8)).toEqual({ bar: "[████████]", pct: 100 });
    expect(progressBar(0, 0, 8)).toEqual({ bar: "[░░░░░░░░]", pct: 0 });
  });

  it("formatDuration renders m:ss", () => {
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(75_000)).toBe("1:15");
  });
});

describe("StatusBar", () => {
  it("shows ready state + model + est context fill when idle", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="gemini-2.5-flash" estTokens={38_000} contextWindow={1_000_000} elapsedMs={0} width={80} hint="/help" />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("● ready");
    expect(frame).toContain("gemini-2.5-flash");
    expect(frame).toContain("~38k/1.0M");
    expect(frame).toContain("4%");
    unmount();
  });

  it("shows the spinner status + elapsed time while busy", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="generating" busy spinner="⠹" model="m" estTokens={0} contextWindow={100} elapsedMs={9_000} width={80} hint="" />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("⠹ generating");
    expect(frame).toContain("0:09");
    unmount();
  });

  it("renders the approval mode as a chip when not in review", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="m" estTokens={0} contextWindow={100} elapsedMs={0} width={80} hint="/help" mode="auto" />,
    );
    expect(lastFrame() ?? "").toContain("⚡auto");
    unmount();
  });
});

describe("tokenWarningLevel", () => {
  const empty = {} as NodeJS.ProcessEnv;
  it("is none below the warn threshold", () => {
    expect(tokenWarningLevel(8_000, 10_000, empty)).toBe("none"); // 80%
  });
  it("warns at/above 85%", () => {
    expect(tokenWarningLevel(8_500, 10_000, empty)).toBe("warn"); // 85%
    expect(tokenWarningLevel(9_000, 10_000, empty)).toBe("warn"); // 90%
  });
  it("is urgent at/above 95%", () => {
    expect(tokenWarningLevel(9_500, 10_000, empty)).toBe("urgent"); // 95%
  });
  it("never warns with a non-positive context window", () => {
    expect(tokenWarningLevel(9_999, 0, empty)).toBe("none");
  });
  it("honors a configured warn fraction", () => {
    const env = { VANTA_TOKEN_WARN_FRAC: "0.5" } as unknown as NodeJS.ProcessEnv;
    expect(tokenWarningLevel(6_000, 10_000, env)).toBe("warn"); // 60% ≥ 0.5
  });
});

describe("tokenWarnFractions", () => {
  it("defaults to 0.85 / 0.95", () => {
    expect(tokenWarnFractions({} as NodeJS.ProcessEnv)).toEqual({ warn: 0.85, urgent: 0.95 });
  });
  it("reads valid env overrides", () => {
    const env = { VANTA_TOKEN_WARN_FRAC: "0.7", VANTA_TOKEN_URGENT_FRAC: "0.9" } as unknown as NodeJS.ProcessEnv;
    expect(tokenWarnFractions(env)).toEqual({ warn: 0.7, urgent: 0.9 });
  });
  it("ignores out-of-range or non-numeric overrides", () => {
    const env = { VANTA_TOKEN_WARN_FRAC: "2", VANTA_TOKEN_URGENT_FRAC: "abc" } as unknown as NodeJS.ProcessEnv;
    expect(tokenWarnFractions(env)).toEqual({ warn: 0.85, urgent: 0.95 });
  });
});

describe("tokenWarnDecor", () => {
  it("returns empty styling for none", () => {
    expect(tokenWarnDecor("none")).toEqual({});
  });
  it("returns yellow /compact styling for warn", () => {
    const d = tokenWarnDecor("warn");
    expect(d.pctColor).toBe("yellow");
    expect(d.tagText).toContain("/compact");
  });
  it("returns red full-context styling for urgent", () => {
    const d = tokenWarnDecor("urgent");
    expect(d.pctColor).toBe("red");
    expect(d.tagText).toContain("context full");
  });
});

describe("StatusBar context warning", () => {
  it("shows a /compact nudge when context is high", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="m" estTokens={9_000} contextWindow={10_000} elapsedMs={0} width={120} hint="/help" />,
    );
    expect(lastFrame() ?? "").toContain("/compact");
    unmount();
  });
  it("shows an urgent full-context warning at 95%+", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="m" estTokens={9_700} contextWindow={10_000} elapsedMs={0} width={120} hint="/help" />,
    );
    expect(lastFrame() ?? "").toContain("context full");
    unmount();
  });
  it("shows no warning at low context", () => {
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="m" estTokens={1_000} contextWindow={10_000} elapsedMs={0} width={120} hint="/help" />,
    );
    expect(lastFrame() ?? "").not.toContain("/compact");
    unmount();
  });

  it("does not wrap the status line at 80 cols even when urgent", () => {
    // The urgent nudge REPLACES the right-side hint, so the line can't grow wider.
    // An unexpected status-line wrap is the overflow class behind the ghost frames.
    const { lastFrame, unmount } = render(
      <StatusBar status="idle" busy={false} spinner="⠋" model="claude-opus-4-8" estTokens={195_000} contextWindow={200_000} elapsedMs={0} width={80} hint="^O details  /help  ?  /exit" />,
    );
    const lines = (lastFrame() ?? "").trimEnd().split("\n");
    expect(lines.length).toBe(1); // single row — no wrap
    expect(lines[0]).toContain("/compact");
    unmount();
  });
});
