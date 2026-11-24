import { describe, expect, it, vi } from "vitest";
import { focusDesktopComposer, handleGlobalShortcut, type GlobalShortcutActions } from "./global-shortcuts.js";

function actions(): GlobalShortcutActions {
  return {
    focusComposer: vi.fn(),
    openPalette: vi.fn(),
    openNewTask: vi.fn(),
    openReview: vi.fn(),
    cycleAccessMode: vi.fn(),
    openShortcuts: vi.fn(),
    closeOverlays: vi.fn(),
  };
}

function keyboardEvent(init: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; target?: EventTarget }): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: init.target ?? null,
    defaultPrevented: false,
    preventDefault() { Object.defineProperty(this, "defaultPrevented", { value: true, configurable: true }); },
  } as unknown as KeyboardEvent;
}

describe("desktop global shortcuts", () => {
  it("focuses the composer at the end without replacing its draft", () => {
    const composer = { disabled: false, value: "keep this draft", focus: vi.fn(), setSelectionRange: vi.fn() };
    const documentRef = { querySelector: vi.fn(() => composer) } as unknown as Document;
    focusDesktopComposer(documentRef);
    expect(composer.focus).toHaveBeenCalledOnce();
    expect(composer.value).toBe("keep this draft");
    expect(composer.setSelectionRange).toHaveBeenCalledWith(composer.value.length, composer.value.length);
  });

  it.each(["metaKey", "ctrlKey"] as const)("routes %s+L to the composer", (modifier) => {
    const callbacks = actions();
    const event = keyboardEvent({ key: "l", [modifier]: true });
    expect(handleGlobalShortcut(event, callbacks)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.focusComposer).toHaveBeenCalledOnce();
  });

  it("preserves Shift+Tab for reverse focus navigation", () => {
    const callbacks = actions();
    const event = keyboardEvent({ key: "Tab", shiftKey: true });
    expect(handleGlobalShortcut(event, callbacks)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(callbacks.cycleAccessMode).not.toHaveBeenCalled();
  });

  it("uses Command+Shift+M for access-mode cycling", () => {
    const callbacks = actions();
    const event = keyboardEvent({ key: "m", metaKey: true, shiftKey: true });
    expect(handleGlobalShortcut(event, callbacks)).toBe(true);
    expect(callbacks.cycleAccessMode).toHaveBeenCalledOnce();
  });

  it("does not open shortcut help while typing", () => {
    const callbacks = actions();
    const event = keyboardEvent({ key: "?", target: { tagName: "INPUT" } as unknown as EventTarget });
    expect(handleGlobalShortcut(event, callbacks)).toBe(false);
    expect(callbacks.openShortcuts).not.toHaveBeenCalled();
  });
});
