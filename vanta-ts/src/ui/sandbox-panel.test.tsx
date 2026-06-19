import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { SandboxPanel } from "./sandbox-panel.js";
import { sandboxState, sandboxDoctor, type SandboxState, type ToggleKey } from "../settings/sandbox.js";

const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";
const noop = (): void => {};
// Real Ink reads piped input over several readable cycles; flush generously so a
// single arrow/Enter press lands before we assert on the frame.
const ticks = async (): Promise<void> => { for (let i = 0; i < 6; i++) await tick(); };

function make(overrides: Partial<SandboxState> = {}): SandboxState {
  return { ...sandboxState({}, {}), ...overrides };
}

function render(state: SandboxState, cb: { onToggle?: (k: ToggleKey) => void; onCycleOverride?: (t: string) => void } = {}) {
  return renderUi(h(SandboxPanel, {
    state,
    doctor: sandboxDoctor(state, "darwin"),
    onToggle: cb.onToggle ?? noop,
    onCycleOverride: cb.onCycleOverride ?? noop,
    onClose: noop,
  }));
}

describe("SandboxPanel — tabs + render", () => {
  it("opens on the Config tab with the three toggles", async () => {
    const inst = render(make({ enabled: true }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Sandbox settings");
    expect(out).toContain("[Config]"); // active tab marker
    expect(out).toContain("Sandbox code runners");
    expect(out).toContain("Allow network");
    inst.unmount();
  });

  it("→ switches to the Dependencies tab and lists packages", async () => {
    const inst = render(make({ dependencies: ["ripgrep", "fd"] }));
    await tick();
    inst.input(RIGHT);
    await ticks();
    const out = inst.lastFrame();
    expect(out).toContain("[Dependencies]");
    expect(out).toContain("Pre-install packages (2)");
    expect(out).toContain("ripgrep");
    inst.unmount();
  });

  it("→→ shows the Doctor diagnostics", async () => {
    const inst = render(make({ allowNetwork: true }));
    await tick();
    inst.input(RIGHT);
    await ticks();
    inst.input(RIGHT);
    await ticks();
    const out = inst.lastFrame();
    expect(out).toContain("[Doctor]");
    expect(out).toContain("Backend");
    expect(out).toContain("network ALLOWED");
    inst.unmount();
  });

  it("← from Config wraps to Overrides", async () => {
    const inst = render(make({ overrides: [{ tool: "git", rule: "bypass" }] }));
    await tick();
    inst.input(LEFT);
    await ticks();
    const out = inst.lastFrame();
    expect(out).toContain("[Overrides]");
    expect(out).toContain("Per-tool rules (1)");
    expect(out).toContain("git");
    inst.unmount();
  });
});

describe("SandboxPanel — actions", () => {
  it("⏎ on a Config row fires onToggle with that flag", async () => {
    const onToggle = vi.fn();
    const inst = render(make(), { onToggle });
    await tick();
    inst.input(ENTER); // first row = enabled
    await ticks();
    expect(onToggle).toHaveBeenCalledWith("enabled");
    inst.unmount();
  });

  it("⏎ on the second Config row toggles shellOnly", async () => {
    const onToggle = vi.fn();
    const inst = render(make(), { onToggle });
    await tick();
    inst.input(DOWN);
    await ticks();
    inst.input(ENTER);
    await ticks();
    expect(onToggle).toHaveBeenCalledWith("shellOnly");
    inst.unmount();
  });

  it("⏎ on an Overrides row cycles that tool's rule", async () => {
    const onCycleOverride = vi.fn();
    const inst = render(make({ overrides: [{ tool: "run_code", rule: "enforce" }] }), { onCycleOverride });
    await tick();
    inst.input(LEFT); // Config → Overrides
    await ticks();
    inst.input(ENTER);
    await ticks();
    expect(onCycleOverride).toHaveBeenCalledWith("run_code");
    inst.unmount();
  });

  it("Esc closes the panel", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(SandboxPanel, { state: make(), doctor: [], onToggle: noop, onCycleOverride: noop, onClose }));
    await tick();
    inst.input(ESC);
    await ticks();
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});
