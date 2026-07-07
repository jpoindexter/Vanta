import { createElement as h } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { renderUi, waitForFrame } from "./test-render.js";
import { HelpPanel } from "./help-panel.js";

// VANTA-SHORTCUT-DISPLAY — the help overlay's chord hint comes from the live
// keybinding config (via useShortcut), not a hardcoded literal. With no user
// config, loadKeybindings falls back to DEFAULT_BINDINGS → exitOrAbort = ⌃C.

describe("HelpPanel", () => {
  afterEach(() => { /* renderUi instances self-clean per test */ });

  it("renders the interrupt/exit hint as the configured display chord (⌃C)", async () => {
    const inst = renderUi(h(HelpPanel, { onClose: () => {} }));
    // ⌃C is the glyph form produced by displayChord — proves it went through the
    // shortcut lookup, not the old hardcoded "^C" string.
    await waitForFrame(inst, "⌃C");
    expect(inst.lastFrame()).toContain("interrupt a running turn");
    inst.unmount();
  });

  it("still shows the static (non-chord) rows", async () => {
    const inst = renderUi(h(HelpPanel, { onClose: () => {} }));
    await waitForFrame(inst, "command palette");
    const frame = inst.lastFrame();
    expect(frame).toContain("mention a file");
    expect(frame).toContain("Shortcuts");
    inst.unmount();
  });
});
