import { parseChord } from "./chord.js";
import type { Binding, BindingHandler, Chord, KeyContext } from "./types.js";

// The single source of truth for every keybinding. "registry" bindings are
// fired through useKeybinding; "composer"/"builtin" bindings are handled
// elsewhere but listed here so the help overlay reads from one table.

// A spec row: [action, chord strings, description, handledBy?]. handledBy
// defaults to the group's default (4th arg overrides it for one row).
type SpecRow = [action: string, chords: string[], description: string, handledBy?: BindingHandler];
type Group = [context: KeyContext, defaultHandler: BindingHandler, rows: SpecRow[]];

const GROUPS: Group[] = [
  ["global", "registry", [
    ["app.exit", ["ctrl+c"], "exit Vanta"],
    ["app.cycleApprovalMode", ["shift+tab"], "cycle approval mode (review → accept-edits → auto)"],
    ["help.toggle", ["?"], "toggle this help (type ? then ⏎)", "builtin"],
  ]],
  ["transcript", "registry", [
    ["transcript.toggleExpand", ["ctrl+o"], "fold / unfold tool detail"],
    ["transcript.scrollUp", ["pageup"], "scroll up half a page (fn+↑ on Mac)"],
    ["transcript.scrollDown", ["pagedown"], "scroll down half a page (fn+↓ on Mac)"],
    ["transcript.scrollLineUp", ["shift+up"], "scroll one line up"],
    ["transcript.scrollLineDown", ["shift+down"], "scroll one line down"],
    ["transcript.scrollToBottom", ["ctrl+end"], "jump to the latest output"],
  ]],
  ["composer", "composer", [
    ["composer.submit", ["return"], "submit message"],
    ["composer.newline", ["shift+return"], "insert newline (multiline)"],
    ["composer.cursorStart", ["ctrl+a"], "cursor to line start"],
    ["composer.cursorEnd", ["ctrl+e"], "cursor to line end"],
    ["composer.killToStart", ["ctrl+u"], "clear to line start"],
    ["composer.killToEnd", ["ctrl+k"], "clear to line end"],
    ["composer.killWordBack", ["ctrl+w"], "delete word before cursor"],
    ["composer.deleteForward", ["ctrl+d"], "delete char at cursor"],
    ["composer.yank", ["ctrl+y"], "yank (paste last kill)"],
    ["composer.wordLeft", ["meta+b"], "cursor back one word"],
    ["composer.wordRight", ["meta+f"], "cursor forward one word"],
    ["composer.historyPrev", ["ctrl+p"], "previous sent message"],
    ["composer.historyNext", ["ctrl+n"], "next sent message"],
  ]],
  ["palette", "registry", [
    ["palette.prev", ["up"], "previous command"],
    ["palette.next", ["down"], "next command"],
    ["palette.complete", ["tab"], "autocomplete the command"],
  ]],
  ["at-palette", "registry", [
    ["atPalette.prev", ["up"], "previous file"],
    ["atPalette.next", ["down"], "next file"],
    ["atPalette.complete", ["tab"], "autocomplete the @file"],
  ]],
  ["modal", "builtin", [
    ["modal.prev", ["up"], "previous item"],
    ["modal.next", ["down"], "next item"],
    ["modal.confirm", ["return"], "select"],
    ["modal.cancel", ["escape"], "cancel"],
  ]],
];

function expandGroups(groups: Group[]): Binding[] {
  const out: Binding[] = [];
  for (const [context, defaultHandler, rows] of groups) {
    for (const [action, chordSpecs, description, handledBy] of rows) {
      out.push({ action, chords: chordSpecs.map(parseChord), context, description, handledBy: handledBy ?? defaultHandler });
    }
  }
  return out;
}

export const DEFAULT_BINDINGS: readonly Binding[] = expandGroups(GROUPS);

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
