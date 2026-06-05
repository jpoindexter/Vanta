// Paste collapsing for the composer. When a large block is pasted, replace it
// in the input with a compact "[Pasted text #N +L lines]" reference and stash
// the full text; expand the references back on submit. Mirrors the Claude CLI —
// keeps the composer readable instead of flooding it with the whole paste.
//
// The pure helpers below are unit-tested. The composer wires them at the
// text-insert point + on submit. (A long paste must arrive as one input event,
// which modern terminals deliver via bracketed paste; char-by-char terminals
// fall back to normal insertion — no collapse, current behavior.)

const COLLAPSE_MIN_CHARS = 200;
const COLLAPSE_MIN_LINES = 4;

export type PasteStore = { refs: Map<string, string>; next: number };

export function newPasteStore(): PasteStore {
  return { refs: new Map(), next: 1 };
}

export function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

/** A single input event large enough to collapse into a reference. Pure. */
export function shouldCollapse(input: string): boolean {
  return input.length >= COLLAPSE_MIN_CHARS || lineCount(input) >= COLLAPSE_MIN_LINES;
}

/** The compact placeholder shown in the composer for a stashed paste. Pure. */
export function pasteRef(index: number, text: string): string {
  const lines = lineCount(text);
  const unit = lines > 1 ? `+${lines} lines` : `+${text.length} chars`;
  return `[Pasted text #${index} ${unit}]`;
}

/** Register a paste; return its placeholder and advance the store. */
export function collapse(store: PasteStore, text: string): string {
  const ref = pasteRef(store.next, text);
  store.refs.set(ref, text);
  store.next += 1;
  return ref;
}

// Matches any placeholder this module emits.
const REF_RE = /\[Pasted text #\d+ \+\d+ (?:lines|chars)\]/g;

/**
 * Expand every "[Pasted text …]" placeholder in `text` back to its stashed
 * content. Unknown/edited references are left as-is. Pure (reads the store).
 */
export function expandPastes(text: string, store: PasteStore): string {
  if (store.refs.size === 0) return text;
  return text.replace(REF_RE, (m) => store.refs.get(m) ?? m);
}
