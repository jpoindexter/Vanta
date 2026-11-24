import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ModeLine, cycleMode } from "./app.js";

describe("cycleMode — Shift+Tab autonomy cycle", () => {
  it("cycles manual → accept edits → plan → auto → manual", () => {
    const set = vi.fn();

    cycleMode("default", set);
    expect(set).toHaveBeenCalledWith("acceptEdits");

    set.mockClear();
    cycleMode("acceptEdits", set);
    expect(set).toHaveBeenCalledWith("plan");

    set.mockClear();
    cycleMode("plan", set);
    expect(set).toHaveBeenCalledWith("auto");

    set.mockClear();
    cycleMode("auto", set);
    expect(set).toHaveBeenCalledWith("default");
  });

  it("returns an externally selected full-access mode to default", () => {
    const set = vi.fn();

    cycleMode("fullAccess", set);

    expect(set).toHaveBeenCalledWith("default");
  });
});

describe("ModeLine", () => {
  it("shows the accept-edits badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "acceptEdits" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("accept edits on");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("shows the enforced plan badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "plan" }));
    await tick();
    expect(inst.lastFrame()).toContain("plan mode on");
    expect(inst.lastFrame()).toContain("shift+tab");
    inst.unmount();
  });

  it("shows the auto badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "auto" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("auto mode on");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("shows the full-access badge with the cycle hint", async () => {
    const inst = renderUi(h(ModeLine, { mode: "fullAccess" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("full access on");
    expect(out).toContain("shift+tab");
    inst.unmount();
  });

  it("keeps manual mode visible", async () => {
    const inst = renderUi(h(ModeLine, { mode: "default" }));
    await tick();
    expect(inst.lastFrame()).toContain("manual mode on");
    expect(inst.lastFrame()).toContain("? for shortcuts");
    inst.unmount();
  });
});
