import { describe, it, expect, vi } from "vitest";
import { handleGlobalKey } from "./app-keys.js";
import { DEFAULT_BINDINGS, GLOBAL_ACTIONS, resolveBindings } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

// KEYBINDING-CUSTOMIZATION — config-driven global-key dispatch (no Ink render).

function deps(over: Record<string, unknown> = {}) {
  return {
    busy: false, pending: null, overlayOpen: false,
    abort: vi.fn(), exit: vi.fn(), cycle: vi.fn(),
    focus: "composer" as const, focusTargets: [], setFocus: vi.fn(),
    quickOpenOpen: false, openQuickOpen: vi.fn(),
    cycleAgent: vi.fn(),
    bindings: DEFAULT_BINDINGS,
    ...over,
  };
}

describe("handleGlobalKey — default bindings", () => {
  it("ctrl+c exits when idle, aborts when busy", () => {
    const idle = deps(); handleGlobalKey("c", { ctrl: true }, idle as never);
    expect(idle.exit).toHaveBeenCalled();
    const busy = deps({ busy: true }); handleGlobalKey("c", { ctrl: true }, busy as never);
    expect(busy.abort).toHaveBeenCalled();
  });

  it("ctrl+p opens quick-open only when nothing else owns input", () => {
    const open = deps(); handleGlobalKey("p", { ctrl: true }, open as never);
    expect(open.openQuickOpen).toHaveBeenCalled();
    const blocked = deps({ overlayOpen: true }); handleGlobalKey("p", { ctrl: true }, blocked as never);
    expect(blocked.openQuickOpen).not.toHaveBeenCalled();
  });

  it("escape interrupts only when busy", () => {
    const busy = deps({ busy: true }); handleGlobalKey("", { escape: true }, busy as never);
    expect(busy.abort).toHaveBeenCalled();
    const idle = deps(); handleGlobalKey("", { escape: true }, idle as never);
    expect(idle.abort).not.toHaveBeenCalled();
  });

  it("shift+arrows cycle the teammate tree when cycleAgent is set", () => {
    const d = deps(); handleGlobalKey("", { shift: true, rightArrow: true } as never, d as never);
    expect(d.cycleAgent).toHaveBeenCalledWith(1);
    const d2 = deps(); handleGlobalKey("", { shift: true, leftArrow: true } as never, d2 as never);
    expect(d2.cycleAgent).toHaveBeenCalledWith(-1);
  });
});

describe("handleGlobalKey — CUSTOM bindings take effect on the live path", () => {
  it("a user-rebound quick-open chord (ctrl+k) dispatches; the old ctrl+p no longer does", () => {
    const custom: KeyBinding[] = resolveBindings(DEFAULT_BINDINGS, [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k", context: "global" }]);
    const d = deps({ bindings: custom });
    handleGlobalKey("k", { ctrl: true }, d as never);
    expect(d.openQuickOpen).toHaveBeenCalledTimes(1);
    const d2 = deps({ bindings: custom });
    handleGlobalKey("p", { ctrl: true }, d2 as never); // old default chord — now unbound
    expect(d2.openQuickOpen).not.toHaveBeenCalled();
  });
});
