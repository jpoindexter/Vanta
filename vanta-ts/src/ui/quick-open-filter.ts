import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

// Pure aggregation + fuzzy-ranking for the Ctrl+P QuickOpenDialog. Kept free of
// React/Ink so the matching logic is unit-testable without a render. Each result
// carries the slash COMMAND it runs on Enter, mirroring the overlays.ts pattern —
// so activation reduces to the same runSlash path the typed command uses.

export type QuickCategory = "file" | "session" | "command" | "skill";

/** A single quick-open candidate. `command` is the slash line Enter runs. */
export type QuickItem = {
  category: QuickCategory;
  label: string;
  hint?: string;
  command: string;
};

/** Category → glyph, so the four entry-point types stay visually distinct. */
export const CATEGORY_ICON: Readonly<Record<QuickCategory, string>> = {
  file: "F",
  session: "S",
  command: "/",
  skill: "*",
};

type Sources = {
  files?: string[];
  sessions?: SessionMeta[];
  commands?: ReadonlyArray<{ name: string; arg?: string; desc: string }>;
  skills?: Skill[];
};

/** Flatten every entry-point source into one ordered candidate list. Each source
 * degrades gracefully when empty/absent. */
export function aggregateItems(sources: Sources): QuickItem[] {
  return [
    ...(sources.files ?? []).map((f): QuickItem => ({ category: "file", label: f, command: `/open ${f}` })),
    ...(sources.sessions ?? []).map((s): QuickItem => ({
      category: "session",
      label: s.id,
      hint: s.title,
      command: `/resume ${s.id}`,
    })),
    ...(sources.commands ?? []).map((c): QuickItem => ({
      category: "command",
      label: `/${c.name}${c.arg ? ` ${c.arg}` : ""}`,
      hint: c.desc,
      command: `/${c.name}`,
    })),
    ...(sources.skills ?? []).map((s): QuickItem => ({
      category: "skill",
      label: s.meta.name,
      hint: s.meta.description,
      command: `/${s.meta.name}`,
    })),
  ];
}

/** Subsequence fuzzy match: every char of `query` appears in `text` in order.
 * Returns a score (lower = better) or null when it doesn't match. */
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (q === "") return 0;
  let ti = 0;
  let score = 0;
  let lastHit = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (lastHit >= 0) score += found - lastHit - 1; // penalise gaps between hits
    if (found === 0 || t[found - 1] === "/" || t[found - 1] === "-") score -= 1; // boundary bonus
    lastHit = found;
    ti = found + 1;
  }
  return score + tieBreak(t, q);
}

/** Earlier first match and shorter text rank higher; keeps stable ordering. */
function tieBreak(text: string, query: string): number {
  const first = text.indexOf(query[0]!);
  return first * 0.1 + text.length * 0.001;
}

/** Rank candidates by fuzzy match against label + hint, capped at `limit`. */
export function fuzzyFilter(items: QuickItem[], query: string, limit = 12): QuickItem[] {
  const q = query.trim();
  if (q === "") return items.slice(0, limit);
  const scored: { item: QuickItem; score: number }[] = [];
  for (const item of items) {
    const labelScore = fuzzyScore(item.label, q);
    const hintScore = item.hint ? fuzzyScore(item.hint, q) : null;
    const best = pickBest(labelScore, hintScore);
    if (best !== null) scored.push({ item, score: best });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/** Best (lowest) of two optional scores; hint matches cost a small premium. */
function pickBest(label: number | null, hint: number | null): number | null {
  const h = hint === null ? null : hint + 2;
  if (label === null) return h;
  if (h === null) return label;
  return Math.min(label, h);
}
