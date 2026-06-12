import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../../store/home.js";
import { parseChord } from "./chord.js";
import type { Chord } from "./types.js";

// Optional user keybinding overrides at ~/.vanta/keybindings.json. Shape is a
// flat { "<action>": "<chord>" | ["<chord>", ...] } map — an action's value
// REPLACES its default chords. Invalid entries are skipped (never throw on a
// user typo at startup); a wholly unreadable/invalid file yields no overrides.

const ChordValue = z.union([z.string(), z.array(z.string())]);
const UserBindingsSchema = z.record(z.string(), ChordValue);

/** Path to the user keybindings file (override VANTA_HOME for tests). */
export function userBindingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "keybindings.json");
}

/** Parse a validated raw map into action → chords, skipping malformed chords. */
export function parseUserBindings(raw: Record<string, string | string[]>): Record<string, Chord[]> {
  const out: Record<string, Chord[]> = {};
  for (const [action, value] of Object.entries(raw)) {
    const specs = Array.isArray(value) ? value : [value];
    const chords: Chord[] = [];
    for (const spec of specs) {
      try {
        chords.push(parseChord(spec));
      } catch {
        // skip one bad chord; keep the rest
      }
    }
    if (chords.length > 0) out[action] = chords;
  }
  return out;
}

/** Load + validate user overrides; returns {} when the file is absent/invalid. */
export function loadUserKeybindings(env: NodeJS.ProcessEnv = process.env): Record<string, Chord[]> {
  let text: string;
  try {
    text = readFileSync(userBindingsPath(env), "utf8");
  } catch {
    return {}; // no file → no overrides
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {}; // malformed JSON → ignore rather than crash the TUI
  }
  const parsed = UserBindingsSchema.safeParse(json);
  if (!parsed.success) return {};
  return parseUserBindings(parsed.data);
}
