import { useEffect, useState } from "react";
import { DEFAULT_BINDINGS, lookupChord, displayChord, loadKeybindings } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

// VANTA-SHORTCUT-DISPLAY — one source of truth for "what key does X here", read
// from the user's LIVE keybinding config so a hint never lies. Two entry points:
// a sync function (commands, services, non-React callers) and a React hook (help
// overlays, dialogs, footers). Both resolve action+context → the CONFIGURED
// chord's display text, so a rebind in ~/.vanta/keybindings.json shows through.

/**
 * Display text for the chord bound to `action` in `context` (global fallback),
 * over an explicit binding set. `fallback` is returned when the action is
 * unbound (default ""). Pure — the sync variant for non-React callers. */
export function shortcutFor(action: string, context: string, bindings: KeyBinding[], fallback = ""): string {
  const chord = lookupChord(bindings, action, context);
  return chord ? displayChord(chord) : fallback;
}

/**
 * The current effective bindings for React surfaces (defaults until
 * ~/.vanta/keybindings.json loads; a re-mount picks up an edit). Shared by every
 * hint so they can't drift from the config. */
export function useKeybindingSet(): KeyBinding[] {
  const [bindings, setBindings] = useState<KeyBinding[]>(DEFAULT_BINDINGS);
  useEffect(() => {
    void loadKeybindings().then(setBindings).catch(() => {});
  }, []);
  return bindings;
}

/**
 * React hook returning a `shortcut(action, context?)` lookup bound to the live
 * config — for help overlays, dialogs, and footers. `shortcut("global.quickOpen")`
 * → "⌃P" (or the user's rebind). */
export function useShortcut(): (action: string, context?: string, fallback?: string) => string {
  const bindings = useKeybindingSet();
  return (action, context = "global", fallback = "") => shortcutFor(action, context, bindings, fallback);
}
