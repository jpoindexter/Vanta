import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ConfigPanel } from "./config-panel.js";
import { configState, type ConfigState, type ConfigAction } from "./config-view.js";

const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";
const noop = (): void => {};
// Real Ink reads piped input over several readable cycles; flush generously so a
// single arrow/Enter press lands before we assert on the frame.
const ticks = async (): Promise<void> => { for (let i = 0; i < 6; i++) await tick(); };

function make(overrides: Partial<ConfigState> = {}): ConfigState {
  return { ...configState({}, {}), ...overrides };
}

function render(state: ConfigState, onAction: (a: ConfigAction) => void = noop) {
  return renderUi(h(ConfigPanel, { state, onAction, onClose: noop }));
}

describe("ConfigPanel — render", () => {
  it("lists the groups, current values, and a summary header", async () => {
    const inst = render(make({ effort: "high" }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Config");
    expect(out).toContain("Session");
    expect(out).toContain("Permissions");
    expect(out).toContain("ND gates");
    expect(out).toContain("Effort level");
    expect(out).toContain("high");
    inst.unmount();
  });

  it("renders the model row deferring to the picker, and never the raw dangerous fields", async () => {
    const inst = render(make());
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Model");
    expect(out).toContain("opens the picker");
    expect(out).not.toMatch(/allowedTools|blockedTools/);
    inst.unmount();
  });
});

describe("ConfigPanel — actions", () => {
  it("⏎ on the first row fires cycleEffort", async () => {
    const onAction = vi.fn();
    const inst = render(make(), onAction);
    await tick();
    inst.input(ENTER);
    await ticks();
    expect(onAction).toHaveBeenCalledWith({ kind: "cycleEffort" });
    inst.unmount();
  });

  it("⏎ on the second row fires cycleStyle", async () => {
    const onAction = vi.fn();
    const inst = render(make(), onAction);
    await tick();
    inst.input(DOWN);
    await ticks();
    inst.input(ENTER);
    await ticks();
    expect(onAction).toHaveBeenCalledWith({ kind: "cycleStyle" });
    inst.unmount();
  });

  it("Esc closes the panel", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(ConfigPanel, { state: make(), onAction: noop, onClose }));
    await tick();
    inst.input(ESC);
    await ticks();
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});
