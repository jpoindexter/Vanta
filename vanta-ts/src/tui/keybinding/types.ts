import type { Key } from "ink";

// The keybinding registry's vocabulary. A Chord is a normalized key combination;
// a Binding ties an action id to one or more chords, a context, and a help label.

/** A named (non-printable) key. Maps to one boolean field on ink's Key. */
export type NamedKey =
  | "up" | "down" | "left" | "right"
  | "tab" | "return" | "escape"
  | "pageup" | "pagedown" | "home" | "end"
  | "backspace" | "delete";

/** A normalized key combination. Either `named` or `char` is set, never both. */
export type Chord = {
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  named?: NamedKey;
  /** A single literal character, e.g. "o" for ^O. Lower-case. */
  char?: string;
};

/**
 * Where a binding is live. Contexts let the same chord mean different things
 * depending on what's focused — a "modal" overlay swallows arrows the
 * "transcript" would otherwise scroll. Ordered loosely by precedence.
 */
export type KeyContext =
  | "global" // always live (exit, help)
  | "transcript" // the scrolling history (scroll keys, fold)
  | "composer" // the focused input box (readline edits — handled in composer.tsx)
  | "palette" // slash-command palette open
  | "at-palette" // @-file palette open
  | "modal" // a picker overlay open (sessions/model/skills/theme)
  | "tabs"; // v2 tabbed mission-control surface

/** How a binding's chord is actually serviced at runtime. */
export type BindingHandler = "registry" | "composer" | "builtin";

export type Binding = {
  /** Stable id, e.g. "app.exit", "palette.next". User overrides key off this. */
  action: string;
  /** One or more chords that trigger the action. */
  chords: Chord[];
  context: KeyContext;
  /** Human description for the help overlay. */
  description: string;
  /**
   * Who handles the chord. "registry" → fired via useKeybinding; "composer" →
   * the composer's own readline table; "builtin" → a prefix/slash path. Only
   * "registry" bindings are wired through the hook; the rest are documented
   * here so the help overlay has a single source of truth.
   */
  handledBy: BindingHandler;
};

export type { Key };
