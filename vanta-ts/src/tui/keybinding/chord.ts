import type { Chord, Key, NamedKey } from "./types.js";

// Pure chord parsing, matching, and formatting. No React, no I/O — the testable
// core of the keybinding registry.

/** Named-key token → the boolean field it reads on ink's Key. */
const NAMED_TO_FIELD: Record<NamedKey, keyof Key> = {
  up: "upArrow",
  down: "downArrow",
  left: "leftArrow",
  right: "rightArrow",
  tab: "tab",
  return: "return",
  escape: "escape",
  pageup: "pageUp",
  pagedown: "pageDown",
  home: "home",
  end: "end",
  backspace: "backspace",
  delete: "delete",
};

/** Aliases accepted in chord strings (canonicalised on parse). */
const NAMED_ALIASES: Record<string, NamedKey> = {
  enter: "return",
  esc: "escape",
  pgup: "pageup",
  pgdn: "pagedown",
};

const NAMED_KEYS = new Set(Object.keys(NAMED_TO_FIELD));

function applyModifier(chord: Chord, mod: string, spec: string): void {
  if (mod === "ctrl" || mod === "control") chord.ctrl = true;
  else if (mod === "shift") chord.shift = true;
  else if (mod === "meta" || mod === "alt" || mod === "option") chord.meta = true;
  else throw new Error(`unknown modifier "${mod}" in chord "${spec}"`);
}

function resolveKeyToken(chord: Chord, keyToken: string, spec: string): void {
  const named = NAMED_ALIASES[keyToken] ?? (NAMED_KEYS.has(keyToken) ? (keyToken as NamedKey) : undefined);
  if (named) chord.named = named;
  else if (keyToken.length === 1) chord.char = keyToken;
  else throw new Error(`unknown key "${keyToken}" in chord "${spec}"`);
}

/**
 * Parse a chord string like "ctrl+o", "shift+tab", "shift+up", "ctrl+end".
 * Modifiers: ctrl, shift, meta|alt. The final token is the key — a named key or
 * a single literal character. Throws on an empty/invalid spec (config boundary).
 */
export function parseChord(spec: string): Chord {
  const tokens = spec.trim().toLowerCase().split("+").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error(`empty keybinding chord: "${spec}"`);
  const chord: Chord = { ctrl: false, shift: false, meta: false };
  const keyToken = tokens.pop()!;
  for (const mod of tokens) applyModifier(chord, mod, spec);
  resolveKeyToken(chord, keyToken, spec);
  return chord;
}

/** True when a live (input, key) event matches the chord exactly. */
export function matchChord(chord: Chord, input: string, key: Key): boolean {
  if (!!key.ctrl !== chord.ctrl) return false;
  if (!!key.shift !== chord.shift) return false;
  if (!!key.meta !== chord.meta) return false;
  if (chord.named) return !!key[NAMED_TO_FIELD[chord.named]];
  if (chord.char) return input === chord.char;
  return false;
}

/** Display glyph for a named key in the help overlay. */
const NAMED_GLYPH: Record<NamedKey, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  tab: "⇥",
  return: "⏎",
  escape: "⎋",
  pageup: "pgup",
  pagedown: "pgdn",
  home: "home",
  end: "end",
  backspace: "⌫",
  delete: "⌦",
};

/** Render a chord for display, e.g. "^O", "⇧⇥", "⇧↑", "^end". */
export function formatChord(chord: Chord): string {
  let out = "";
  if (chord.ctrl) out += "^";
  if (chord.meta) out += "⌥";
  if (chord.shift) out += "⇧";
  if (chord.named) out += NAMED_GLYPH[chord.named];
  else if (chord.char) out += chord.char.toUpperCase();
  return out;
}
