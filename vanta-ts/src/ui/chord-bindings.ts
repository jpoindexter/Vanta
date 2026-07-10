import { displayChord, normalizeChord } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

export type ChordResolveResult =
  | { kind: "none" }
  | { kind: "chord_started"; pending: string; message: string }
  | { kind: "chord_cancelled"; pending: string; chord: string; message: string }
  | { kind: "match"; action: string; chord: string };

function candidates(bindings: KeyBinding[], contexts: readonly string[]): KeyBinding[] {
  const seen = new Set<string>();
  const out: KeyBinding[] = [];
  for (const context of [...contexts, "global"]) {
    for (const binding of bindings.filter((b) => b.context === context)) {
      const key = `${binding.context}\0${binding.action}\0${binding.chord}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(binding);
    }
  }
  return out;
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
  contexts: readonly string[] = ["global"],
): ChordResolveResult {
  const current = normalizeChord(chord);
  const next = pending ? `${pending} ${current}` : current;
  const nextSteps = steps(next);
  const matches = candidates(bindings, contexts);
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
