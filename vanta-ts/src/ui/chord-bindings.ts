import { displayChord, normalizeChord } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

export type ChordResolveResult =
  | { kind: "none" }
  | { kind: "chord_started"; pending: string; message: string }
  | { kind: "chord_cancelled"; pending: string; chord: string; message: string }
  | { kind: "match"; action: string; chord: string };

function candidates(bindings: KeyBinding[], context: string): KeyBinding[] {
  return context === "global"
    ? bindings.filter((b) => b.context === "global")
    : [
      ...bindings.filter((b) => b.context === context),
      ...bindings.filter((b) => b.context === "global"),
    ];
}

function steps(chord: string): string[] {
  return normalizeChord(chord).split(/\s+/).filter(Boolean);
}

function hasPrefix(full: string[], prefix: string[]): boolean {
  return prefix.every((step, i) => full[i] === step);
}

export function resolveChordInput(
  bindings: KeyBinding[],
  chord: string,
  pending: string | null = null,
  context = "global",
): ChordResolveResult {
  const current = normalizeChord(chord);
  const next = pending ? `${pending} ${current}` : current;
  const nextSteps = steps(next);
  const matches = candidates(bindings, context);
  const exact = matches.find((b) => normalizeChord(b.chord) === next);
  if (exact) return { kind: "match", action: exact.action, chord: next };

  const prefix = matches.some((b) => {
    const bindingSteps = steps(b.chord);
    return bindingSteps.length > nextSteps.length && hasPrefix(bindingSteps, nextSteps);
  });
  if (prefix) {
    return {
      kind: "chord_started",
      pending: next,
      message: `  chord pending: ${displayChord(next)}`,
    };
  }
  if (pending) {
    return {
      kind: "chord_cancelled",
      pending,
      chord: current,
      message: `  chord cancelled: ${displayChord(pending)} then ${displayChord(current)}`,
    };
  }
  return { kind: "none" };
}
