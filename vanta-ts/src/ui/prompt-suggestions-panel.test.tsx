import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromptSuggestionsPanel } from "./prompt-suggestions-panel.js";
import { renderUi, tick, waitUntil } from "./test-render.js";

const suggestions = ["Verify it", "Commit it", "Show roadmap"];

describe("PromptSuggestionsPanel", () => {
  it("renders predicted next prompts", async () => {
    const inst = renderUi(h(PromptSuggestionsPanel, { suggestions, focused: false, onSelect: () => {} }));
    await tick();
    expect(inst.lastFrame()).toContain("Next prompts");
    expect(inst.lastFrame()).toContain("1. Verify it");
    inst.unmount();
  });

  it("selects the focused row with enter", async () => {
    const onSelect = vi.fn();
    const inst = renderUi(h(PromptSuggestionsPanel, { suggestions, focused: true, onSelect }));
    inst.input("\x1b[B");
    await tick();
    inst.input("\r");
    await waitUntil(() => onSelect.mock.calls.length > 0);
    expect(onSelect).toHaveBeenCalledWith("Commit it");
    inst.unmount();
  });

  it("ignores input when not focused", async () => {
    const onSelect = vi.fn();
    const inst = renderUi(h(PromptSuggestionsPanel, { suggestions, focused: false, onSelect }));
    inst.input("\r");
    await tick();
    expect(onSelect).not.toHaveBeenCalled();
    inst.unmount();
  });
});
