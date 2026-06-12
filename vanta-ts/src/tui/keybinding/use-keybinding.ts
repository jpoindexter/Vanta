import { useInput, type Key } from "ink";
import { matchChord } from "./chord.js";
import { buildChordMap, DEFAULT_BINDINGS } from "./registry.js";
import { loadUserKeybindings } from "./user-bindings.js";
import type { Chord } from "./types.js";

// The runtime side of the registry: resolve an action's chords (defaults merged
// with user overrides) and fire a handler when one matches. Replaces scattered
// inline `useInput((_, key) => if (key.ctrl && …))` checks with a declarative
// `useKeybinding("app.exit", handler)`.

let cached: Map<string, Chord[]> | null = null;

function chordMap(): Map<string, Chord[]> {
  if (!cached) cached = buildChordMap(DEFAULT_BINDINGS, loadUserKeybindings());
  return cached;
}

/** Chords currently bound to an action (after user overrides). */
export function resolveChords(action: string): Chord[] {
  return chordMap().get(action) ?? [];
}

/** Drop the cached merge — call after writing keybindings.json (and in tests). */
export function resetKeybindingCache(): void {
  cached = null;
}

export type KeybindingOptions = { isActive?: boolean };

/**
 * Fire `handler` when any chord bound to `action` matches. `isActive` gates the
 * binding to a context (e.g. only while the slash palette is open). The handler
 * receives the raw (input, key) so it can still inspect the event if needed.
 */
export function useKeybinding(
  action: string,
  handler: (input: string, key: Key) => void,
  opts: KeybindingOptions = {},
): void {
  const chords = resolveChords(action);
  useInput(
    (input, key) => {
      for (const chord of chords) {
        if (matchChord(chord, input, key)) {
          handler(input, key);
          return;
        }
      }
    },
    { isActive: opts.isActive ?? true },
  );
}
