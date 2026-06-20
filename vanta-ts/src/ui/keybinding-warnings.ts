// VANTA-KEYBINDING-WARNINGS — pure keybinding conflict detector + warnings.
//
// A *conflict* is two (or more) actions bound to the SAME chord within the SAME
// context — pressing that chord in that context is ambiguous. A *shadow* is a
// lower-severity note: a binding in a SPECIFIC context reuses a chord that a
// GLOBAL binding also claims, so the specific binding shadows the global one in
// that context. Same chord in two DIFFERENT specific contexts is NOT a conflict
// (the contexts never coexist) and NOT a shadow (neither is global).
//
// This module is PURE — it takes the resolved binding list and returns the
// conflicts + a one-line warning per conflict. No conflicts → no warnings ([]).
//
// WIRING (named, not done this round — mirrors the clarity gate):
//   • Load seam: wherever the keybinding registry resolves DEFAULT_BINDINGS
//     merged with the user's `~/.vanta/keybindings.json` overrides (the keybinding
//     registry deleted in the 06-13 TUI rebuild; when it is re-introduced its
//     loader is the seam). Right after that merge, call
//     `findKeybindingConflicts(resolvedBindings)` and surface each
//     `buildConflictWarning(conflict)` line (fail-soft: a conflict warns, it
//     does not throw or drop the binding).
//   • Report seam: a `/doctor`-style health report (e.g. status.ts /
//     cli/ops.ts doctor surface) would call `hasConflicts(bindings)` and list
//     `findKeybindingConflicts(...).map(buildConflictWarning)` under a
//     "keybindings" section.

/** The context a chord is active in. `global` applies everywhere; the rest are
 *  mutually exclusive focus surfaces (mirrors the TUI build-plan KeyContext). */
export const GLOBAL_CONTEXT = "global";

/** One resolved keybinding: an action id bound to a chord within a context. */
export type KeyBinding = {
  /** Action id, e.g. "transcript.toggleExpand". */
  action: string;
  /** The chord, in its canonical form, e.g. "ctrl+t" / "shift+tab". */
  chord: string;
  /** The context the chord is active in (`global` or a specific surface). */
  context: string;
};

/** Conflict kind: a true same-context clash, or a global-vs-specific shadow. */
export type ConflictKind = "conflict" | "shadow";

/** A detected keybinding conflict. For "conflict", `actions` lists every action
 *  bound to `chord` in `context` (>1). For "shadow", `context` is the SPECIFIC
 *  context and `actions` is [specificAction, globalAction] (the shadower first,
 *  the shadowed global second). */
export type KeybindingConflict = {
  chord: string;
  context: string;
  actions: string[];
  kind: ConflictKind;
};

/** Stable `chord␟context` group key (unit separator can't appear in either). */
function groupKey(chord: string, context: string): string {
  return `${chord}␟${context}`;
}

/** Same-context conflicts: group by (chord, context); any group with >1 distinct
 *  action is ambiguous. Actions are de-duplicated (the same action listed twice
 *  for one chord+context is a redundant binding, not a conflict). */
function sameContextConflicts(bindings: KeyBinding[]): KeybindingConflict[] {
  const groups = new Map<string, { chord: string; context: string; actions: string[] }>();
  for (const b of bindings) {
    const key = groupKey(b.chord, b.context);
    const g = groups.get(key) ?? { chord: b.chord, context: b.context, actions: [] };
    if (!g.actions.includes(b.action)) g.actions.push(b.action);
    groups.set(key, g);
  }
  const out: KeybindingConflict[] = [];
  for (const g of groups.values()) {
    if (g.actions.length > 1) out.push({ ...g, kind: "conflict" });
  }
  return out;
}

/** Shadow notes: a chord bound globally AND in a specific context shadows the
 *  global one in that context. One note per (chord, specific-context, global-
 *  action) pair. Same-context global dupes are caught by `sameContextConflicts`. */
function shadowNotes(bindings: KeyBinding[]): KeybindingConflict[] {
  const globalByChord = new Map<string, string>();
  for (const b of bindings) {
    if (b.context === GLOBAL_CONTEXT && !globalByChord.has(b.chord)) globalByChord.set(b.chord, b.action);
  }
  const seen = new Set<string>();
  const out: KeybindingConflict[] = [];
  for (const b of bindings) {
    if (b.context === GLOBAL_CONTEXT) continue;
    const globalAction = globalByChord.get(b.chord);
    if (globalAction === undefined || globalAction === b.action) continue;
    const key = `${groupKey(b.chord, b.context)}␟${b.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ chord: b.chord, context: b.context, actions: [b.action, globalAction], kind: "shadow" });
  }
  return out;
}

/**
 * All keybinding conflicts in `bindings`: same-context clashes first (higher
 * severity), then global-vs-specific shadows. No conflicts → []. Pure.
 */
export function findKeybindingConflicts(bindings: KeyBinding[]): KeybindingConflict[] {
  return [...sameContextConflicts(bindings), ...shadowNotes(bindings)];
}

/** True when any conflict (same-context or shadow) exists. Pure. */
export function hasConflicts(bindings: KeyBinding[]): boolean {
  return findKeybindingConflicts(bindings).length > 0;
}

const OVERRIDES_FILE = "~/.vanta/keybindings.json";

/** Join a list of action ids as "a, b and c". */
function joinActions(actions: string[]): string {
  if (actions.length <= 1) return actions[0] ?? "";
  return `${actions.slice(0, -1).join(", ")} and ${actions[actions.length - 1]}`;
}

/**
 * The one-line warning for a conflict, naming both actions, the context, and the
 * resolution file. For a "conflict": "chord <X> in <context> is bound to A and B
 * — rebind one in ~/.vanta/keybindings.json". For a "shadow": notes that the
 * specific binding shadows the global one. Pure.
 */
export function buildConflictWarning(conflict: KeybindingConflict): string {
  const { chord, context, actions, kind } = conflict;
  if (kind === "shadow") {
    const [specific, global] = actions;
    return `warning: chord ${chord} in ${context} (${specific}) shadows the global binding (${global}) — rebind one in ${OVERRIDES_FILE}`;
  }
  return `warning: chord ${chord} in ${context} is bound to ${joinActions(actions)} — rebind one in ${OVERRIDES_FILE}`;
}
