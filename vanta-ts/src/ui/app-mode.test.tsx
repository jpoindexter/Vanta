import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ModeLine, cycleMode } from "./app.js";
import { shouldAutoApprove } from "./mode-line.js";

describe("cycleMode — Shift+Tab autonomy cycle", () => {
  it("cycles default → acceptEdits → auto → default", () => {
    const set = vi.fn();
    const run = vi.fn();

    cycleMode("default", set, run);
    expect(set).toHaveBeenCalledWith("acceptEdits");
    expect(run).not.toHaveBeenCalled();

    set.mockClear();
    cycleMode("acceptEdits", set, run);
    expect(set).toHaveBeenCalledWith("auto");
    expect(run).not.toHaveBeenCalled();

    set.mockClear();
    run.mockClear();
    cycleMode("auto", set, run);
    expect(set).toHaveBeenCalledWith("default");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("ModeLine", () => {
  it("does not auto-approve a fresh transaction decision", () => {
    const pending = { action: "pay", reason: "purchase", fresh: true, resolve: vi.fn() };
    expect(shouldAutoApprove(pending, "auto")).toBe(false);
    expect(shouldAutoApprove({ ...pending, fresh: false }, "auto")).toBe(true);
  });

  it("shows the accept-edits badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "acceptEdits" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("EDITS");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("shows the auto badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "auto" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("AUTO");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("renders nothing in default mode", async () => {
    const inst = renderUi(h(ModeLine, { mode: "default" }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});
