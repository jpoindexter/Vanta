import { describe, it, expect, vi } from "vitest";
import { buildFocusTargets, handleGlobalKey } from "./app-keys.js";
import { DEFAULT_BINDINGS, GLOBAL_ACTIONS, resolveBindings } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

// KEYBINDING-CUSTOMIZATION — config-driven global-key dispatch (no Ink render).

function deps(over: Record<string, unknown> = {}) {
  return {
    busy: false, pending: null, overlayOpen: false,
    abort: vi.fn(), exit: vi.fn(), cycle: vi.fn(),
    focus: "composer" as const, focusTargets: [], setFocus: vi.fn(),
    quickOpenOpen: false, openQuickOpen: vi.fn(),
    globalSearchOpen: false, openGlobalSearch: vi.fn(),
    messageActionsOpen: false, openMessageActions: vi.fn(),
    backgroundResponseAvailable: false, toggleBackgroundResponse: vi.fn(),
    cycleAgent: vi.fn(),
    bindings: DEFAULT_BINDINGS,
    ...over,
  };
}
type TestDeps = ReturnType<typeof deps> & { chordPending?: string | null };

describe("handleGlobalKey — default bindings", () => {
  it("ctrl+c exits when idle, aborts when busy", () => {
    const idle = deps(); handleGlobalKey("c", { ctrl: true }, idle as never);
    expect(idle.exit).toHaveBeenCalled();
    const busy = deps({ busy: true }); handleGlobalKey("c", { ctrl: true }, busy as never);
    expect(busy.abort).toHaveBeenCalled();
  });

  it("transcript selection owns ctrl+c before the global exit shortcut", () => {
    const transcriptSelectionKey = vi.fn(() => true);
    const d = deps({ transcriptSelectionKey });
    handleGlobalKey("c", { ctrl: true }, d as never);
    expect(transcriptSelectionKey).toHaveBeenCalledWith("c", { ctrl: true });
    expect(d.exit).not.toHaveBeenCalled();
  });

  it("ctrl+p opens quick-open only when nothing else owns input", () => {
    const open = deps(); handleGlobalKey("p", { ctrl: true }, open as never);
    expect(open.openQuickOpen).toHaveBeenCalled();
    const blocked = deps({ overlayOpen: true }); handleGlobalKey("p", { ctrl: true }, blocked as never);
    expect(blocked.openQuickOpen).not.toHaveBeenCalled();
  });

  it("ctrl+shift+p opens global session search when nothing else owns input", () => {
    const open = deps(); handleGlobalKey("p", { ctrl: true, shift: true }, open as never);
    expect(open.openGlobalSearch).toHaveBeenCalled();
    const blocked = deps({ quickOpenOpen: true }); handleGlobalKey("p", { ctrl: true, shift: true }, blocked as never);
    expect(blocked.openGlobalSearch).not.toHaveBeenCalled();
  });

  it("shift+up opens message actions when nothing else owns input", () => {
    const open = deps(); handleGlobalKey("", { shift: true, upArrow: true }, open as never);
    expect(open.openMessageActions).toHaveBeenCalled();
    const blocked = deps({ globalSearchOpen: true }); handleGlobalKey("", { shift: true, upArrow: true }, blocked as never);
    expect(blocked.openMessageActions).not.toHaveBeenCalled();
  });

  it("ctrl+b backgrounds or attaches responses when available", () => {
    const busy = deps({ busy: true }); handleGlobalKey("b", { ctrl: true }, busy as never);
    expect(busy.toggleBackgroundResponse).toHaveBeenCalledTimes(1);

    const attach = deps({ backgroundResponseAvailable: true }); handleGlobalKey("b", { ctrl: true }, attach as never);
    expect(attach.toggleBackgroundResponse).toHaveBeenCalledTimes(1);

    const idle = deps(); handleGlobalKey("b", { ctrl: true }, idle as never);
    expect(idle.toggleBackgroundResponse).not.toHaveBeenCalled();

    const blocked = deps({ busy: true, overlayOpen: true }); handleGlobalKey("b", { ctrl: true }, blocked as never);
    expect(blocked.toggleBackgroundResponse).not.toHaveBeenCalled();
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

  it("multi-step chords show pending state, then dispatch on completion", () => {
    const custom: KeyBinding[] = resolveBindings(DEFAULT_BINDINGS, [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k ctrl+s", context: "global" }]);
    let pending: string | null = null;
    const note = vi.fn();
    let d: TestDeps;
    d = deps({
      bindings: custom,
      chordPending: pending,
      setChordPending: (next: string | null) => { pending = next; d.chordPending = next; },
      onChordState: note,
    }) as TestDeps;

    handleGlobalKey("k", { ctrl: true }, d as never);
    expect(d.openQuickOpen).not.toHaveBeenCalled();
    expect(pending).toBe("ctrl+k");
    expect(note).toHaveBeenCalledWith(expect.stringContaining("chord pending"));

    handleGlobalKey("s", { ctrl: true }, d as never);
    expect(d.openQuickOpen).toHaveBeenCalledTimes(1);
    expect(pending).toBeNull();
  });

  it("invalid chord followup cancels without side effects", () => {
    const custom: KeyBinding[] = resolveBindings(DEFAULT_BINDINGS, [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k ctrl+s", context: "global" }]);
    let pending: string | null = "ctrl+k";
    const note = vi.fn();
    let d: TestDeps;
    d = deps({
      bindings: custom,
      chordPending: pending,
      setChordPending: (next: string | null) => { pending = next; d.chordPending = next; },
      onChordState: note,
    }) as TestDeps;

    handleGlobalKey("x", { ctrl: true }, d as never);
    expect(d.openQuickOpen).not.toHaveBeenCalled();
    expect(pending).toBeNull();
    expect(note).toHaveBeenCalledWith(expect.stringContaining("chord cancelled"));
  });

  it("context-specific bindings fire only when their context is active", () => {
    const custom: KeyBinding[] = [
      ...DEFAULT_BINDINGS,
      { action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+j", context: "historySearch" },
      { action: GLOBAL_ACTIONS.globalSearch, chord: "ctrl+j", context: "global" },
    ];
    const search = deps({ bindings: custom, keyContexts: ["historySearch", "chat", "global"] });
    handleGlobalKey("j", { ctrl: true }, search as never);
    expect(search.openQuickOpen).toHaveBeenCalledTimes(1);
    expect(search.openGlobalSearch).not.toHaveBeenCalled();

    const chat = deps({ bindings: custom, keyContexts: ["chat", "global"] });
    handleGlobalKey("j", { ctrl: true }, chat as never);
    expect(chat.openQuickOpen).not.toHaveBeenCalled();
    expect(chat.openGlobalSearch).toHaveBeenCalledTimes(1);
  });
});

describe("buildFocusTargets", () => {
  it("adds prompt suggestions as a keyboard focus target only when visible", () => {
    expect(buildFocusTargets(null, null, false).map((t) => t.id)).toEqual(["composer"]);
    expect(buildFocusTargets(null, null, true).map((t) => t.id)).toEqual(["composer", "prompt-suggestions"]);
  });
});
