import { usePaste } from "ink";
import { execSync } from "node:child_process";
import { readlineEdit, type Key, type Edit } from "./composer-keys.js";
import { replaceSelection, selEmpty, type Sel } from "./selection.js";
import { PASTE_PILL_CHARS, pillTokenAt } from "./paste-pill.js";

// Pure input-event processing for the Composer: paste detection / normalization
// + the paste hook, and the line-level key-chord handlers the component's
// `useInput` dispatches to. Split from composer.tsx so both stay under the size
// gate; composer.tsx re-exports the public helpers unchanged. Collapsing a large
// paste to its buffer marker lives in paste-pill.ts.

export { countLines, PASTE_PILL_THRESHOLD, PASTE_PILL_CHARS } from "./paste-pill.js";

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

/**
 * A single input chunk that is a paste rather than typing. Either it carries a
 * line break (a raw CR would otherwise read as Enter and submit mid-paste), or
 * it is longer than any human keystroke burst — a terminal that strips newlines
 * delivers a long paste as one chunk with no break to detect. Both must take the
 * paste path so CRs are normalized and a big one collapses to its marker.
 */
export function isRawPasteChunk(input: string): boolean {
  return isMultiLinePaste(input) || input.length >= PASTE_PILL_CHARS;
}

type TextPasteOpts = {
  read: () => { value: string; cursor: number; selection?: Sel | null }; focused: boolean;
  setBuf: (v: string, c: number) => void; onImagePaste?: () => void;
  /** Swap pill-worthy text for its buffer marker; short text passes through. */
  collapse: (text: string) => string;
};

export function useTextPaste(o: TextPasteOpts): (text: string) => void {
  const pasteText = (raw: string): void => {
    if (!o.focused) return;
    // Raw-image Cmd+V: an image-only clipboard has no text representation, so the
    // terminal sends an empty bracketed paste (Ink emits usePaste("")). Grab the
    // clipboard image instead of inserting nothing. Harmless on a truly-empty
    // clipboard (the /paste handler just reports "no image").
    if (o.onImagePaste && isImagePasteSignal(raw)) { o.onImagePaste(); return; }
    // CR → LF so it can't overwrite the render or submit, then collapse a large
    // paste to its marker so the input line stays short and typable after it.
    const text = o.collapse(normalizePaste(raw));
    const { value, cursor, selection } = o.read(); // refs → the LATEST buffer, never a stale closure
    const activeSelection = selection ?? null;
    const next = selEmpty(activeSelection) ? { value: value.slice(0, cursor) + text + value.slice(cursor), cursor: cursor + text.length } : replaceSelection(value, activeSelection, text);
    o.setBuf(next.value, next.cursor);
  };
  // Bracketed paste mode: text with newlines arrives as one string, not returns.
  usePaste(pasteText);
  return pasteText;
}

/**
 * Backspace inside a collapsed-paste marker removes the whole marker. Deleting
 * one character would leave `[Pasted text #1 +50 line` — a label the user cannot
 * repair, whose stored text would then be orphaned and silently dropped at
 * submit. Modified deletes (^U, ⌥⌫, ⌘⌫) keep their readline meaning. True when
 * handled.
 */
export function handlePillDelete(key: Key, value: string, cursor: number, setBuf: (v: string, c: number) => void): boolean {
  if (!key.backspace && !key.delete) return false;
  if (key.meta || key.super || key.ctrl) return false;
  const span = pillTokenAt(value, cursor);
  if (!span) return false;
  setBuf(value.slice(0, span.start) + value.slice(span.end), span.start);
  return true;
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

/**
 * ↑ pulls the most recent queued message back into the composer for editing —
 * but ONLY from an empty buffer. Up is already spoken for three ways (history
 * nav here, transcript selection globally, palette nav when one is open), and
 * Shift+Up is taken by message actions, so an unconditional hijack would destroy
 * history recall. Gating on an empty composer is the same rule Claude Code uses
 * and leaves every other Up behaviour intact. True when handled.
 */
export function handleQueueEdit(
  key: Key,
  ctx: { value: string; cursor: number; activeLen: number; queuedCount: number },
  edit: (index: number) => string | undefined,
  setBuf: (v: string, c: number) => void,
): boolean {
  if (!key.upArrow) return false;
  if (ctx.value !== "" || ctx.cursor !== 0 || ctx.activeLen > 0 || ctx.queuedCount === 0) return false;
  const text = edit(ctx.queuedCount - 1); // most recently queued first
  if (text === undefined) return false;
  setBuf(text, text.length);
  return true;
}

/** ↑/↓ (palette closed) or ^P/^N walk the input history. True when handled. */
export function handleHistory(input: string, key: Key, nav: (dir: "up" | "down") => void): boolean {
  const up = key.upArrow || (key.ctrl && input === "p");
  const down = key.downArrow || (key.ctrl && input === "n");
  if (up) { nav("up"); return true; }
  if (down) { nav("down"); return true; }
  return false;
}

type PaletteKeyOpts = { key: Key; len: number; sel: number; setSel: (n: number) => void; complete: () => void };

/** Palette navigation: ↑/↓ move the selection, Tab completes. True when handled. */
export function handlePaletteKey(o: PaletteKeyOpts): boolean {
  if (o.key.upArrow) { o.setSel(Math.max(0, o.sel - 1)); return true; }
  if (o.key.downArrow) { o.setSel(Math.min(o.len - 1, o.sel + 1)); return true; }
  if (o.key.tab) { o.complete(); return true; }
  return false;
}
