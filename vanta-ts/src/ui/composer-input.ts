import { useRef, useState } from "react";
import { usePaste } from "ink";
import { execSync } from "node:child_process";
import { readlineEdit, type Key, type Edit } from "./composer-keys.js";
import { replaceSelection, selEmpty, selRange, type Sel } from "./selection.js";

// Pure input-event processing for the Composer: line counting, paste detection /
// normalization + the paste hooks, and the line-level key-chord handlers the
// component's `useInput` dispatches to. Split from composer.tsx so both stay
// under the size gate; composer.tsx re-exports the public helpers unchanged.

/** Lines in value (0 for empty string, 1 for single-line, N for N-1 newlines). */
export function countLines(value: string): number {
  if (value === "") return 0;
  return (value.match(/\n/g) ?? []).length + 1;
}

export const PASTE_PILL_THRESHOLD = 3;
// Also collapse a long paste whose newlines got normalized away by the terminal —
// it arrives as a few very long lines (≤3), so the line threshold alone misses it
// and the long lines wrap/overlap into a scramble. A buffer this long is a paste,
// not typing, so collapse it to the pill regardless of line count.
export const PASTE_PILL_CHARS = 500;

/**
 * Opt-in paste guard for terminals that DON'T bracket pastes (so a multi-line
 * paste arrives as raw keystrokes and its newlines look like Enter, submitting
 * mid-paste). Set `VANTA_PASTE_BURST_MS` (e.g. 6): a return arriving within that
 * many ms of the previous keystroke is treated as a paste newline, not a submit
 * — a human types-then-Enter with a >80ms gap, a paste delivers it in a few ms.
 * Default 0 = OFF (bracketed paste, when the terminal supports it, handles this).
 */
export function isPasteBurst(lastInputAt: number): boolean {
  const ms = Number(process.env.VANTA_PASTE_BURST_MS) || 0;
  return ms > 0 && Date.now() - lastInputAt < ms;
}

/**
 * A bracketed paste with no text is the terminal's signal that the clipboard held
 * non-text content (e.g. a screenshot's raw image bytes) — the text representation
 * is empty. That's our cue to try grabbing a clipboard image instead of inserting.
 */
export function isImagePasteSignal(pasted: string): boolean {
  return pasted.trim() === "";
}

/**
 * Normalize pasted text for the buffer: CRLF and lone CR → LF. A raw carriage
 * return returns the terminal cursor to column 0 WITHOUT a line feed, so the next
 * line overwrites the previous one — the interleaved "scramble" — and a CR also
 * reads as Enter (submitting mid-paste). Many clipboards use CRLF/CR endings, so a
 * CR must never enter the buffer.
 */
export function normalizePaste(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * A multi-char input chunk containing a line break is a raw (non-bracketed) paste
 * fragment — route it through the paste path so its CRs are normalized and it can
 * never be read as Enter. A lone keystroke (incl. a bare Enter) or an escape
 * sequence (arrows have no CR/LF) is left to normal key handling.
 */
export function isMultiLinePaste(input: string): boolean {
  return input.length > 1 && /[\r\n]/.test(input);
}

type TextPasteOpts = {
  read: () => { value: string; cursor: number; selection?: Sel | null }; focused: boolean;
  setBuf: (v: string, c: number) => void; onImagePaste?: () => void;
  onTextPaste?: (paste: { value: string; text: string; start: number; end: number }) => void;
};

export function useTextPaste(o: TextPasteOpts): (text: string) => void {
  const pasteText = (raw: string): void => {
    if (!o.focused) return;
    // Raw-image Cmd+V: an image-only clipboard has no text representation, so the
    // terminal sends an empty bracketed paste (Ink emits usePaste("")). Grab the
    // clipboard image instead of inserting nothing. Harmless on a truly-empty
    // clipboard (the /paste handler just reports "no image").
    if (o.onImagePaste && isImagePasteSignal(raw)) { o.onImagePaste(); return; }
    const text = normalizePaste(raw); // CR → LF so it can't overwrite the render or submit
    const { value, cursor, selection } = o.read(); // refs → the LATEST buffer, never a stale closure
    const activeSelection = selection ?? null;
    const start = selEmpty(activeSelection) ? cursor : selRange(activeSelection).start;
    const next = selEmpty(activeSelection) ? { value: value.slice(0, cursor) + text + value.slice(cursor), cursor: cursor + text.length } : replaceSelection(value, activeSelection, text);
    o.setBuf(next.value, next.cursor);
    o.onTextPaste?.({ value: next.value, text, start, end: start + text.length });
  };
  // Bracketed paste mode: text with newlines arrives as one string, not returns.
  usePaste(pasteText);
  return pasteText;
}

export type PastePill = { count: number; lines: number; start: number; end: number };

function shouldCollapsePaste(value: string): boolean {
  return countLines(value) > PASTE_PILL_THRESHOLD || value.length > PASTE_PILL_CHARS;
}

function displayLineCount(value: string): number {
  return Math.max(countLines(value), Math.ceil(value.length / 80));
}

export function usePastePill(): {
  pill?: PastePill;
  recordPaste: (paste: { value: string; text: string; start: number; end: number }) => void;
  reconcileEdit: (before: string, after: string) => void;
  clearPill: () => void;
} {
  const pasteCountRef = useRef(0);
  const pillRef = useRef<PastePill | undefined>(undefined);
  const [pill, setPill] = useState<PastePill | undefined>(undefined);
  const updatePill = (next?: PastePill): void => { pillRef.current = next; setPill(next); };
  const clearPill = (): void => updatePill(undefined);
  const recordPaste = (paste: { value: string; text: string; start: number; end: number }): void => {
    if (!shouldCollapsePaste(paste.text)) return;
    pasteCountRef.current++;
    const current = pillRef.current;
    const start = current ? Math.min(current.start, paste.start) : paste.start;
    const end = current ? Math.max(current.end, paste.end) : paste.end;
    updatePill({ count: pasteCountRef.current, lines: displayLineCount(paste.value.slice(start, end)), start, end });
  };
  const reconcileEdit = (before: string, after: string): void => {
    const current = pillRef.current;
    if (!current || before === after) return;
    let changedAt = 0;
    const shared = Math.min(before.length, after.length);
    while (changedAt < shared && before[changedAt] === after[changedAt]) changedAt++;
    // Edits at/after the collapsed span are safe: their text remains visible.
    // An edit before or inside it invalidates the offsets, so expand honestly.
    if (changedAt < current.end) clearPill();
  };
  return {
    pill,
    recordPaste,
    reconcileEdit,
    clearPill,
  };
}

/** Enter submits (or shift+enter newlines). True when handled. */
export function handleReturnKey(key: Key, pasteBurst: boolean, insertNewline: () => void, submitNow: () => void): boolean {
  if (!key.return) return false;
  (key.shift || pasteBurst) ? insertNewline() : submitNow();
  return true;
}

/** Right-arrow accepts the ghost suggestion. `ghost` is "" when no match — guard is cheap. */
function handleGhostAccept(key: Key, ghost: string, accepted: string, setBuf: (v: string, c: number) => void): boolean {
  if (!key.rightArrow || !ghost) return false;
  setBuf(accepted, accepted.length);
  return true;
}

type GhostOrEdit = {
  input: string; key: Key; ghost: string; value: string; cursor: number; killRing: string;
  setBuf: (v: string, c: number) => void; applyEdit: (e: Edit) => void;
};

/** The default key path: accept the ghost suggestion, else apply a readline edit. */
export function handleGhostOrEdit(o: GhostOrEdit): void {
  if (handleGhostAccept(o.key, o.ghost, o.value + o.ghost, o.setBuf)) return;
  const edit = readlineEdit({ value: o.value, cursor: o.cursor, killRing: o.killRing }, o.input, o.key);
  if (edit) o.applyEdit(edit);
}

/** ^G edit-in-$EDITOR · ^Z undo/redo · ^V paste text (then image fallback). True when handled. */
export function handleSpecialChord(input: string, key: Key, a: { openEditor: () => void; undo: () => void; pasteText: (t: string) => void; paste?: () => void }): boolean {
  if (key.ctrl && input === "g") { a.openEditor(); return true; }
  if (key.ctrl && input === "z") { a.undo(); return true; }
  if (key.ctrl && input === "v") {
    try {
      const text = execSync("pbpaste", { encoding: "utf8", timeout: 1000 });
      if (text) { a.pasteText(text); return true; }
    } catch { /* pbpaste unavailable (non-macOS) — fall through */ }
    a.paste?.();
    return true;
  }
  return false;
}

export function readClipboardText(): string {
  try { return execSync("pbpaste", { encoding: "utf8", timeout: 1000 }); } catch { return ""; }
}

export function writeClipboardText(text: string): boolean {
  try { execSync("pbcopy", { input: text, timeout: 1000 }); return true; } catch { return false; }
}

/** ↑/↓ (palette closed) or ^P/^N walk the input history. True when handled. */
export function handleHistory(input: string, key: Key, nav: (dir: "up" | "down") => void): boolean {
  const up = key.upArrow || (key.ctrl && input === "p");
  const down = key.downArrow || (key.ctrl && input === "n");
  if (up) { nav("up"); return true; }
  if (down) { nav("down"); return true; }
  return false;
}

/** Pull the newest queued message into an empty composer for editing. */
export function handleQueueEdit(
  key: Key,
  ctx: { value: string; cursor: number; activeLen: number; queuedCount: number },
  edit: (index: number) => string | undefined,
  setBuf: (value: string, cursor: number) => void,
): boolean {
  if (!key.upArrow || ctx.value !== "" || ctx.cursor !== 0 || ctx.activeLen > 0 || ctx.queuedCount === 0) return false;
  const text = edit(ctx.queuedCount - 1);
  if (text === undefined) return false;
  setBuf(text, text.length);
  return true;
}

type PaletteKeyOpts = { key: Key; len: number; sel: number; setSel: (n: number) => void; complete: () => void };

/** Palette navigation: ↑/↓ move the selection, Tab completes. True when handled. */
export function handlePaletteKey(o: PaletteKeyOpts): boolean {
  if (o.key.upArrow) { o.setSel(Math.max(0, o.sel - 1)); return true; }
  if (o.key.downArrow) { o.setSel(Math.min(o.len - 1, o.sel + 1)); return true; }
  if (o.key.tab) { o.complete(); return true; }
  return false;
}
