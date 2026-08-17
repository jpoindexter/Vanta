import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModelPickPanel } from "./model-pick-panel.js";
import { renderUi, tick, waitUntil } from "./test-render.js";

const baseProps = {
  providerId: "claude-code",
  providerLabel: "Claude Code",
  models: ["claude-sonnet-5", "claude-opus-4-8"],
  currentModel: "claude-sonnet-5",
  currentEffort: "medium" as const,
  onSwitchProvider: vi.fn(),
  onClose: vi.fn(),
};

describe("ModelPickPanel", () => {
  it("opens on the active provider with a Claude-style model list and controls", async () => {
    const instance = renderUi(h(ModelPickPanel, { ...baseProps, onApply: vi.fn() }));
    await tick();
    expect(instance.lastFrame()).toContain("Select model");
    expect(instance.lastFrame()).toContain("1. claude-sonnet-5");
    expect(instance.lastFrame()).toContain("2. claude-opus-4-8");
    expect(instance.lastFrame()).toContain("Medium effort");
    expect(instance.lastFrame()).toContain("b/Tab model setup");
    instance.unmount();
  });

  it("returns to model setup with b or Tab and closes on Esc", async () => {
    const onSwitchProvider = vi.fn();
    const onClose = vi.fn();
    const instance = renderUi(h(ModelPickPanel, { ...baseProps, onApply: vi.fn(), onSwitchProvider, onClose }));
    await tick();
    instance.input("b");
    await waitUntil(() => onSwitchProvider.mock.calls.length > 0);
    instance.input("\u001b");
    await waitUntil(() => onClose.mock.calls.length > 0);
    expect(onSwitchProvider).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    instance.unmount();
  });

  it("applies the selected model and effort with the requested scope", async () => {
    const onApply = vi.fn();
    const instance = renderUi(h(ModelPickPanel, { ...baseProps, onApply }));
    await tick();
    instance.input("\u001b[B");
    await tick();
    instance.input("s");
    await waitUntil(() => onApply.mock.calls.length > 0);
    expect(onApply).toHaveBeenCalledWith({
      providerId: "claude-code",
      model: "claude-opus-4-8",
      effort: "medium",
      speed: "standard",
      scope: "session",
    });
    instance.unmount();
  });

  it("hides unsupported controls for a local provider", async () => {
    const instance = renderUi(h(ModelPickPanel, {
      providerId: "ollama",
      providerLabel: "Ollama",
      models: ["qwen2.5:14b"],
      currentModel: "qwen2.5:14b",
      onApply: vi.fn(),
      onSwitchProvider: vi.fn(),
      onClose: vi.fn(),
    }));
    await tick();
    expect(instance.lastFrame()).not.toContain("effort");
    expect(instance.lastFrame()).not.toContain("speed");
    instance.unmount();
  });
});
