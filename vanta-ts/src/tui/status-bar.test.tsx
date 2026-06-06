import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatusBar, estimateTokens, formatCount, progressBar, formatDuration } from "./status-bar.js";

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
});
