import { useRef } from "react";

// Collapse a large paste to a compact marker INSIDE the buffer. The previous
// design swapped the whole rendered input line for a pill widget whenever the
// buffer passed a line/char threshold, so every character typed after a paste
// went into the buffer invisibly — the composer looked dead. A marker is
// ordinary buffer text, so cursor, selection, palettes and typing all keep
// working around it; the original text is held out-of-buffer and restored at
// submit time, which also keeps a huge paste from wrapping into a scramble.

export const PASTE_PILL_THRESHOLD = 3;
export const PASTE_PILL_CHARS = 500;
const WRAP_COLS = 80;

/** Fresh regex per call — a shared /g literal carries `lastIndex` between uses. */
const tokenRe = (): RegExp => /\[Pasted text #(\d+) \+\d+ lines?\]/g;

/** Lines in value (0 for empty string, 1 for single-line, N for N-1 newlines). */
export function countLines(value: string): number {
  if (value === "") return 0;
  return (value.match(/\n/g) ?? []).length + 1;
}

/** Visual row estimate. A paste whose newlines the terminal stripped is one long
 * logical line, so fall back to wrapped rows so the marker's count still reads
 * sensibly instead of claiming "+1 line" for 700 characters. */
export function pillLineCount(text: string): number {
  return Math.max(countLines(text), Math.ceil(text.length / WRAP_COLS));
}

/** True when pasted text is big enough to collapse: more than a few lines, or
 * long enough that its wrapped rows would swamp the input line. */
export function shouldPill(text: string): boolean {
  return countLines(text) > PASTE_PILL_THRESHOLD || text.length > PASTE_PILL_CHARS;
}

/** The marker standing in for a collapsed paste inside the buffer. */
export function pillToken(id: number, lines: number): string {
  return `[Pasted text #${id} +${lines} ${lines === 1 ? "line" : "lines"}]`;
}

/** Restore every collapsed paste in `value` from `store`. A marker with no entry
 * (recalled from history, or hand-typed) is left verbatim — never dropped. */
export function expandPills(value: string, store: ReadonlyMap<number, string>): string {
  return value.replace(tokenRe(), (match, id: string) => store.get(Number(id)) ?? match);
}

/** The marker whose span contains `cursor`, so backspace can remove it whole.
 * Chewing one character off `[Pasted text #1 +50 lines]` would leave a label the
 * user cannot repair and silently orphan the stored text. */
export function pillTokenAt(value: string, cursor: number): { start: number; end: number } | null {
  for (const m of value.matchAll(tokenRe())) {
    const start = m.index;
    const end = start + m[0].length;
    if (cursor > start && cursor <= end) return { start, end };
  }
  return null;
}

export type PillSegment = { text: string; pill: boolean };

/**
 * Split `value` into runs, flagging the collapsed-paste markers. The view dims
 * the flagged runs so a marker reads as a placeholder for text held elsewhere,
 * not as literal characters the user typed and can edit letter by letter.
 */
export function splitPills(value: string): PillSegment[] {
  const segments: PillSegment[] = [];
  let last = 0;
  for (const m of value.matchAll(tokenRe())) {
    if (m.index > last) segments.push({ text: value.slice(last, m.index), pill: false });
    segments.push({ text: m[0], pill: true });
    last = m.index + m[0].length;
  }
  if (last < value.length) segments.push({ text: value.slice(last), pill: false });
  return segments;
}

export type PasteCollapse = {
  /** Collapse pill-worthy text to its marker; return short text unchanged. */
  collapse: (text: string) => string;
  /** Restore the originals behind every marker in `value`. */
  expand: (value: string) => string;
  /** Drop the store and restart numbering (called when the buffer is cleared). */
  reset: () => void;
};

/**
 * Out-of-buffer store for collapsed pastes. Refs, not state: a paste can arrive
 * as several chunks within one React tick, and collapsing must be readable in
 * that same tick — state would still hold the previous store.
 */
export function usePasteCollapse(): PasteCollapse {
  const storeRef = useRef(new Map<number, string>());
  const nextIdRef = useRef(1);
  return {
    collapse: (text: string): string => {
      if (!shouldPill(text)) return text;
      const id = nextIdRef.current++;
      storeRef.current.set(id, text);
      return pillToken(id, pillLineCount(text));
    },
    expand: (value: string): string => expandPills(value, storeRef.current),
    reset: (): void => {
      storeRef.current = new Map();
      nextIdRef.current = 1;
    },
  };
}
