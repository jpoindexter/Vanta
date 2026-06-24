import { useRef, useState, type ReactElement } from "react";
import { useInput, usePaste } from "ink";
import { matchSlash, completeSlash, isPartialSlash, type SlashMatch } from "./slash.js";
import { activeAtRef, matchAtFiles, completeAtRef, slackCompletionFor, channelSuggestionLabels, completeChannelRef } from "./at.js";
import type { SlackChannel } from "../repl/slack-suggest.js";
import { readlineEdit, navigateHistory, historyTypeahead, type Key, type Edit, type HistState } from "./composer-keys.js";
import { useVim } from "./use-vim.js";
import { execSync } from "node:child_process";
import { editInEditor } from "./composer-editor.js";
import { ComposerView } from "./composer-view.js";

export { ComposerView } from "./composer-view.js";

// The v2 composer on real Ink's useInput. Readline/emacs chords (^A/^E/^B/^F,
// ^U/^K/^W kill, ^Y yank, ^D delete, ⌥←/→ word) live in composer-keys; here we
// own the React state and the line-level keys: Enter submits (expanding a partial
// slash command), Shift+Enter newlines, ↑/↓ walk history (or the palette when one
// is open), ^G edits the buffer in $EDITOR, ^Z undo/redo, ^V pastes a clipboard
// image. Small by construction — the fork's input layer is what ate days.

const EMPTY_HIST: HistState = { histIdx: -1, draft: "", value: "" };

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
 * Composer buffer state with a SYNCHRONOUS value+cursor mirror (`valueRef`/
 * `cursorRef`). A paste can arrive as several useInput chunks within one React
 * tick; reading the `value` closure there is stale (no re-render yet), so each
 * chunk would overwrite the previous and characters get lost/scrambled. Edit
 * handlers read the refs so every chunk builds on the latest buffer.
 */
function useComposerBuffer(): {
  value: string; cursor: number; sel: number;
  setSel: (n: number) => void;
  valueRef: { current: string }; cursorRef: { current: number };
  setBuf: (v: string, c: number) => void;
} {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const valueRef = useRef("");
  const cursorRef = useRef(0);
  const setBuf = (v: string, c: number): void => {
    valueRef.current = v; cursorRef.current = c;
    setValue(v); setCursor(c); setSel(0);
  };
  return { value, cursor, sel, setSel, valueRef, cursorRef, setBuf };
}

export function Composer(props: {
  onSubmit: (text: string) => void;
  placeholder: string;
  files: string[];
  history: string[];
  onPaste?: () => void;
  skills?: SlashMatch[];
  channels?: SlackChannel[];
  focused?: boolean;
  vim?: boolean;
}): ReactElement {
  const { value, cursor, sel, setSel, valueRef, cursorRef, setBuf } = useComposerBuffer();
  const killRef = useRef("");
  const undoRef = useRef("");
  const histRef = useRef<HistState>(EMPTY_HIST);
  const inputAtRef = useRef(0); // ms timestamp of the last keystroke (paste-burst detection)
  const { pill, clearPill } = usePastePill(value);
  const { slashMatches, atMatches, channelMatches, activeLen } = useComposerPalettes({ value, cursor, files: props.files, channels: props.channels, skills: props.skills });
  const selClamped = Math.min(sel, Math.max(0, activeLen - 1));
  const ghost = activeLen === 0 && histRef.current.histIdx === -1 && cursor === value.length ? historyTypeahead(props.history, value) : "";

  const focused = props.focused ?? true;
  const vimHandle = useVim((props.vim ?? false) && focused);
  const submitNow = (): void => {
    const text = (isPartialSlash(value, slashMatches) ? completeSlash(value, slashMatches, selClamped) : value).trim();
    setBuf("", 0); histRef.current = EMPTY_HIST; clearPill(); vimHandle.reset();
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => { const next = completeBuffer({ value, cursor, slashMatches, channelMatches, atMatches, sel: selClamped }); setBuf(next, next.length); };
  const applyEdit = (e: Edit): void => { if (e.kill !== undefined) { killRef.current = e.kill; undoRef.current = value; } setBuf(e.value, e.cursor); };
  const insertNewline = (): void => setBuf(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1);
  const openEditor = (): void => { undoRef.current = value; const next = editInEditor(value); setBuf(next, next.length); };
  const pasteText = useTextPaste({ read: () => ({ value: valueRef.current, cursor: cursorRef.current }), setBuf, focused, onImagePaste: props.onPaste });
  const undo = (): void => { const prev = undoRef.current; undoRef.current = value; setBuf(prev, prev.length); };
  const histNav = (dir: "up" | "down"): void => { const n = navigateHistory(props.history, histRef.current, dir); histRef.current = n; setBuf(n.value, n.value.length); };

  useInput((input, key) => {
    const burst = isPasteBurst(inputAtRef.current); inputAtRef.current = Date.now(); // a return mid-burst = a paste newline
    if (key.tab && key.shift) return; // Shift+Tab is the global mode cycle (App owns it)
    if (vimHandle.handle({ input, key, value, cursor, setBuf })) return; // vi normal mode owns the key; insert falls through
    if (isMultiLinePaste(input)) { pasteText(input); return; } // raw multi-line paste chunk → normalize, never submit
    if (handleReturnKey(key, burst, insertNewline, submitNow)) return;
    if (handleSpecialChord(input, key, { openEditor, undo, pasteText, paste: props.onPaste })) return;
    if (activeLen > 0 && handlePaletteKey({ key, len: activeLen, sel: selClamped, setSel, complete: completeNow })) return;
    if (handleHistory(input, key, histNav)) return;
    handleGhostOrEdit({ input, key, ghost, value: valueRef.current, cursor: cursorRef.current, killRing: killRef.current, setBuf, applyEdit });
  }, { isActive: focused });

  return <ComposerView focused={focused} slashMatches={slashMatches} atMatches={atMatches} channelMatches={channelSuggestionLabels(channelMatches)} sel={selClamped} value={value} cursor={cursor} placeholder={props.placeholder} pill={pill} ghost={ghost} vimMode={vimHandle.mode} />;
}

type PaletteInput = { value: string; cursor: number; files: string[]; channels?: SlackChannel[]; skills?: SlashMatch[] };

function useComposerPalettes(o: PaletteInput): { slashMatches: SlashMatch[]; atMatches: string[]; channelMatches: SlackChannel[]; activeLen: number } {
  const slashMatches = matchSlash(o.value, o.skills ?? []);
  // `#channel` and `@file` are mutually exclusive: a `#`-token under the cursor opens
  // the channel palette; otherwise we fall to the file palette (slash always wins both).
  const channelMatches = slashMatches.length === 0 ? slackCompletionFor(o.value, o.cursor, o.channels ?? []) : [];
  const atPartial = slashMatches.length === 0 && channelMatches.length === 0 ? activeAtRef(o.value) : null;
  const atMatches = atPartial !== null ? matchAtFiles(o.files, atPartial) : [];
  return { slashMatches, atMatches, channelMatches, activeLen: slashMatches.length || channelMatches.length || atMatches.length };
}

type CompleteInput = { value: string; cursor: number; slashMatches: SlashMatch[]; channelMatches: SlackChannel[]; atMatches: string[]; sel: number };

/** The buffer after Tab-completing the active palette (slash > #channel > @file). */
function completeBuffer(o: CompleteInput): string {
  if (o.slashMatches.length) return completeSlash(o.value, o.slashMatches, o.sel);
  if (o.channelMatches.length) return completeChannelRef(o.value, o.cursor, o.channelMatches, o.sel);
  return completeAtRef(o.value, o.atMatches, o.sel);
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
  read: () => { value: string; cursor: number }; focused: boolean;
  setBuf: (v: string, c: number) => void; onImagePaste?: () => void;
};

function useTextPaste(o: TextPasteOpts): (text: string) => void {
  const pasteText = (raw: string): void => {
    if (!o.focused) return;
    // Raw-image Cmd+V: an image-only clipboard has no text representation, so the
    // terminal sends an empty bracketed paste (Ink emits usePaste("")). Grab the
    // clipboard image instead of inserting nothing. Harmless on a truly-empty
    // clipboard (the /paste handler just reports "no image").
    if (o.onImagePaste && isImagePasteSignal(raw)) { o.onImagePaste(); return; }
    const text = normalizePaste(raw); // CR → LF so it can't overwrite the render or submit
    const { value, cursor } = o.read(); // refs → the LATEST buffer, never a stale closure
    const next = value.slice(0, cursor) + text + value.slice(cursor);
    o.setBuf(next, cursor + text.length);
  };
  // Bracketed paste mode: text with newlines arrives as one string, not returns.
  usePaste(pasteText);
  return pasteText;
}

function usePastePill(value: string): { pill?: { count: number; lines: number }; clearPill: () => void } {
  const pasteCountRef = useRef(0);
  const wasPillRef = useRef(false);
  const lineCount = countLines(value);
  const isPill = lineCount > PASTE_PILL_THRESHOLD || value.length > PASTE_PILL_CHARS;
  if (isPill && !wasPillRef.current) pasteCountRef.current++;
  wasPillRef.current = isPill;
  // Report the VISUAL line count: a newline-stripped paste is one long logical
  // line, so estimate wrapped rows from length (~80 cols) so the pill reads sensibly.
  const displayLines = Math.max(lineCount, Math.ceil(value.length / 80));
  return {
    pill: isPill ? { count: pasteCountRef.current, lines: displayLines } : undefined,
    clearPill: () => { wasPillRef.current = false; },
  };
}

/** Enter submits (or shift+enter newlines). True when handled. */
function handleReturnKey(key: Key, pasteBurst: boolean, insertNewline: () => void, submitNow: () => void): boolean {
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
function handleGhostOrEdit(o: GhostOrEdit): void {
  if (handleGhostAccept(o.key, o.ghost, o.value + o.ghost, o.setBuf)) return;
  const edit = readlineEdit({ value: o.value, cursor: o.cursor, killRing: o.killRing }, o.input, o.key);
  if (edit) o.applyEdit(edit);
}

/** ^G edit-in-$EDITOR · ^Z undo/redo · ^V paste text (then image fallback). True when handled. */
function handleSpecialChord(input: string, key: Key, a: { openEditor: () => void; undo: () => void; pasteText: (t: string) => void; paste?: () => void }): boolean {
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

/** ↑/↓ (palette closed) or ^P/^N walk the input history. True when handled. */
function handleHistory(input: string, key: Key, nav: (dir: "up" | "down") => void): boolean {
  const up = key.upArrow || (key.ctrl && input === "p");
  const down = key.downArrow || (key.ctrl && input === "n");
  if (up) { nav("up"); return true; }
  if (down) { nav("down"); return true; }
  return false;
}

type PaletteKeyOpts = { key: Key; len: number; sel: number; setSel: (n: number) => void; complete: () => void };

/** Palette navigation: ↑/↓ move the selection, Tab completes. True when handled. */
function handlePaletteKey(o: PaletteKeyOpts): boolean {
  if (o.key.upArrow) { o.setSel(Math.max(0, o.sel - 1)); return true; }
  if (o.key.downArrow) { o.setSel(Math.min(o.len - 1, o.sel + 1)); return true; }
  if (o.key.tab) { o.complete(); return true; }
  return false;
}
