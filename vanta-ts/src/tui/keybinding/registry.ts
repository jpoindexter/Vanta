import { parseChord } from "./chord.js";
import type { Binding, Chord, KeyContext } from "./types.js";

// The single source of truth for every keybinding. "registry" bindings are
// fired through useKeybinding; "composer"/"builtin" bindings are handled
// elsewhere but listed here so the help overlay reads from one table.

const b = (
  action: string,
  chordSpecs: string[],
  context: KeyContext,
  description: string,
  handledBy: Binding["handledBy"],
): Binding => ({ action, chords: chordSpecs.map(parseChord), context, description, handledBy });

export const DEFAULT_BINDINGS: readonly Binding[] = [
  // ── global ──────────────────────────────────────────────────────────────
  b("app.exit", ["ctrl+c"], "global", "exit Vanta", "registry"),
  b("app.cycleApprovalMode", ["shift+tab"], "global", "cycle approval mode (review → accept-edits → auto)", "registry"),
  b("help.toggle", ["?"], "global", "toggle this help (type ? then ⏎)", "builtin"),

  // ── transcript ──────────────────────────────────────────────────────────
  b("transcript.toggleExpand", ["ctrl+o"], "transcript", "fold / unfold tool detail", "registry"),
  b("transcript.scrollUp", ["pageup"], "transcript", "scroll up half a page (fn+↑ on Mac)", "registry"),
  b("transcript.scrollDown", ["pagedown"], "transcript", "scroll down half a page (fn+↓ on Mac)", "registry"),
  b("transcript.scrollLineUp", ["shift+up"], "transcript", "scroll one line up", "registry"),
  b("transcript.scrollLineDown", ["shift+down"], "transcript", "scroll one line down", "registry"),
  b("transcript.scrollToBottom", ["ctrl+end"], "transcript", "jump to the latest output", "registry"),

  // ── composer (readline — handled in composer.tsx) ─────────────────────────
  b("composer.submit", ["return"], "composer", "submit message", "composer"),
  b("composer.newline", ["shift+return"], "composer", "insert newline (multiline)", "composer"),
  b("composer.cursorStart", ["ctrl+a"], "composer", "cursor to line start", "composer"),
  b("composer.cursorEnd", ["ctrl+e"], "composer", "cursor to line end", "composer"),
  b("composer.killToStart", ["ctrl+u"], "composer", "clear to line start", "composer"),
  b("composer.killToEnd", ["ctrl+k"], "composer", "clear to line end", "composer"),
  b("composer.killWordBack", ["ctrl+w"], "composer", "delete word before cursor", "composer"),
  b("composer.deleteForward", ["ctrl+d"], "composer", "delete char at cursor", "composer"),
  b("composer.yank", ["ctrl+y"], "composer", "yank (paste last kill)", "composer"),
  b("composer.wordLeft", ["meta+b"], "composer", "cursor back one word", "composer"),
  b("composer.wordRight", ["meta+f"], "composer", "cursor forward one word", "composer"),
  b("composer.historyPrev", ["ctrl+p"], "composer", "previous sent message", "composer"),
  b("composer.historyNext", ["ctrl+n"], "composer", "next sent message", "composer"),

  // ── slash palette ─────────────────────────────────────────────────────────
  b("palette.prev", ["up"], "palette", "previous command", "registry"),
  b("palette.next", ["down"], "palette", "next command", "registry"),
  b("palette.complete", ["tab"], "palette", "autocomplete the command", "registry"),

  // ── @-file palette ─────────────────────────────────────────────────────────
  b("atPalette.prev", ["up"], "at-palette", "previous file", "registry"),
  b("atPalette.next", ["down"], "at-palette", "next file", "registry"),
  b("atPalette.complete", ["tab"], "at-palette", "autocomplete the @file", "registry"),

  // ── modal pickers (handled inside each picker) ─────────────────────────────
  b("modal.prev", ["up"], "modal", "previous item", "builtin"),
  b("modal.next", ["down"], "modal", "next item", "builtin"),
  b("modal.confirm", ["return"], "modal", "select", "builtin"),
  b("modal.cancel", ["escape"], "modal", "cancel", "builtin"),
];

/** First binding declared for an action (the canonical one). */
export function bindingFor(action: string): Binding | undefined {
  return DEFAULT_BINDINGS.find((x) => x.action === action);
}

/** All bindings in a context, in declaration order — drives grouped help. */
export function bindingsForContext(context: KeyContext): Binding[] {
  return DEFAULT_BINDINGS.filter((x) => x.context === context);
}

/**
 * Build an action → chords map, applying user overrides over the defaults.
 * An override replaces (not appends to) the default chords for that action.
 */
export function buildChordMap(
  defaults: readonly Binding[],
  overrides: Record<string, Chord[]>,
): Map<string, Chord[]> {
  const map = new Map<string, Chord[]>();
  for (const binding of defaults) map.set(binding.action, binding.chords);
  for (const [action, chords] of Object.entries(overrides)) {
    if (chords.length > 0) map.set(action, chords);
  }
  return map;
}
