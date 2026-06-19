import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { StatusBar } from "./status-bar.js";
import { composeRichSegments } from "./status-segments.js";

const base = {
  model: "fake-model",
  ctxPct: 12,
  tokens: 24000,
  contextWindow: 200000,
  turns: 2,
  busy: false,
  queued: 0,
};

// Render wide so every present segment fits; narrowing/drop behavior is covered
// by fitSegments unit tests in status-bar.test.ts.
const WIDE = { cols: 160 };

describe("StatusBar rich segments", () => {
  it("renders lines delta, session name, worktree, and vim segments", async () => {
    const rich = composeRichSegments({
      lineDelta: { added: 42, removed: 7 },
      sessionName: "auth-fix",
      isWorktree: true,
      vimEnabled: true,
    });
    const inst = renderUi(h(StatusBar, { ...base, rich }), WIDE);
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("+42/-7");
    expect(frame).toContain("auth-fix");
    expect(frame).toContain("⑂ worktree");
    expect(frame).toContain("vim");
    inst.unmount();
  });

  it("omits the rate-limit segment when no provider data is present", async () => {
    const rich = composeRichSegments({ isWorktree: true });
    const inst = renderUi(h(StatusBar, { ...base, rich }), WIDE);
    await tick();
    const frame = inst.lastFrame();
    expect(frame).not.toContain("5h [");
    expect(frame).not.toContain("7d [");
    expect(frame).toContain("⑂ worktree");
    inst.unmount();
  });

  it("renders the rate-limit bars when a provider supplies data", async () => {
    const rich = composeRichSegments({ rateLimit: { pct5h: 30, pct7d: 12 } });
    const inst = renderUi(h(StatusBar, { ...base, rich }), WIDE);
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("5h [");
    expect(frame).toContain("30%");
    expect(frame).toContain("7d [");
    inst.unmount();
  });

  it("still renders the core model + context gauge with no rich segments", async () => {
    const inst = renderUi(h(StatusBar, { ...base, rich: [] }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("fake-model");
    expect(frame).toContain("12%");
    inst.unmount();
  });

  it("drops rich segments before the model + gauge when the terminal is narrow", async () => {
    const rich = composeRichSegments({ isWorktree: true, vimEnabled: true });
    const inst = renderUi(h(StatusBar, { ...base, rich }), { cols: 30 });
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("fake-model");
    expect(frame).not.toContain("⑂ worktree");
    inst.unmount();
  });
});
