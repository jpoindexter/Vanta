import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ModeLine, cycleMode } from "./app.js";

describe("cycleMode — Shift+Tab autonomy cycle", () => {
  it("cycles normal → auto → plan → normal", () => {
    const set = vi.fn();
    const run = vi.fn();

    cycleMode("normal", set, run);
    expect(set).toHaveBeenCalledWith("auto");
    expect(run).not.toHaveBeenCalled(); // entering auto is TUI-local

    set.mockClear();
    cycleMode("auto", set, run);
    expect(set).toHaveBeenCalledWith("plan");
    expect(run).toHaveBeenCalledWith("/planmode on"); // entering plan enforces

    set.mockClear();
    run.mockClear();
    cycleMode("plan", set, run);
    expect(set).toHaveBeenCalledWith("normal");
    expect(run).toHaveBeenCalledWith("/planmode off"); // leaving plan releases
  });
});

describe("ModeLine", () => {
  it("shows the auto-accept indicator with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "auto" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("auto-accept on");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("shows the plan-mode indicator", async () => {
    const inst = renderUi(h(ModeLine, { mode: "plan" }));
    await tick();
    expect(inst.lastFrame()).toContain("plan mode on");
    inst.unmount();
  });

  it("renders nothing in normal mode", async () => {
    const inst = renderUi(h(ModeLine, { mode: "normal" }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});
