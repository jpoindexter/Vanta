import { useRef, useState, type ReactElement } from "react";
import { useInput } from "ink";
import { matchSlash, completeSlash, isPartialSlash, type SlashMatch } from "./slash.js";
import { activeAtRef, matchContextRefs, completeAtRef, slackCompletionFor, channelSuggestionLabels, completeChannelRef } from "./at.js";
import type { SlackChannel } from "../repl/slack-suggest.js";
import { navigateHistory, historyTypeahead, type Edit, type HistState, type Key } from "./composer-keys.js";
import { useVim } from "./use-vim.js";
import { editInEditor } from "./composer-editor.js";
import { ComposerView } from "./composer-view.js";
import {
  isPasteBurst, isMultiLinePaste, useTextPaste, usePastePill,
  handleReturnKey, handleSpecialChord, handlePaletteKey, handleHistory, handleGhostOrEdit,
  readClipboardText, writeClipboardText,
} from "./composer-input.js";
import type { Sel } from "./selection.js";
import { composerSelectionCommand, extendComposerSelection } from "./composer-selection.js";

export { ComposerView } from "./composer-view.js";
// Pure input-processing helpers live in composer-input.ts; re-export the public
// surface here so importers + tests keep importing them from ./composer.js.
export {
  countLines, PASTE_PILL_THRESHOLD, PASTE_PILL_CHARS, isPasteBurst,
  isImagePasteSignal, normalizePaste, isMultiLinePaste,
} from "./composer-input.js";

// The v2 composer on real Ink's useInput. Readline/emacs chords (^A/^E/^B/^F,
// ^U/^K/^W kill, ^Y yank, ^D delete, ⌥←/→ word) live in composer-keys; here we
// own the React state and the line-level keys: Enter submits (expanding a partial
// slash command), Shift+Enter newlines, ↑/↓ walk history (or the palette when one
// is open), ^G edits the buffer in $EDITOR, ^Z undo/redo, ^V pastes a clipboard
// image. Small by construction — the fork's input layer is what ate days.

const EMPTY_HIST: HistState = { histIdx: -1, draft: "", value: "" };

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
  selection: Sel | null;
  valueRef: { current: string }; cursorRef: { current: number }; selectionRef: { current: Sel | null };
  setBuf: (v: string, c: number) => void;
  setSelection: (s: Sel | null) => void;
} {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const [selection, setSelectionState] = useState<Sel | null>(null);
  const valueRef = useRef("");
  const cursorRef = useRef(0);
  const selectionRef = useRef<Sel | null>(null);
  const setBuf = (v: string, c: number): void => {
    valueRef.current = v; cursorRef.current = c;
    selectionRef.current = null;
    setValue(v); setCursor(c); setSel(0); setSelectionState(null);
  };
  const setSelection = (s: Sel | null): void => {
    selectionRef.current = s; setSelectionState(s);
    if (s) { cursorRef.current = s.cursor; setCursor(s.cursor); }
  };
  return { value, cursor, sel, setSel, selection, valueRef, cursorRef, selectionRef, setBuf, setSelection };
}

type ComposerProps = {
  onSubmit: (text: string) => void;
  placeholder: string;
  files: string[];
  history: string[];
  onPaste?: () => void;
  skills?: SlashMatch[];
  channels?: SlackChannel[];
  focused?: boolean;
  vim?: boolean;
};

export function Composer(props: ComposerProps): ReactElement {
  const { value, cursor, sel, setSel, selection, valueRef, cursorRef, selectionRef, setBuf, setSelection } = useComposerBuffer();
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
  const pasteText = useTextPaste({ read: () => ({ value: valueRef.current, cursor: cursorRef.current, selection: selectionRef.current }), setBuf, focused, onImagePaste: props.onPaste });
  const undo = (): void => { const prev = undoRef.current; undoRef.current = value; setBuf(prev, prev.length); };
  const histNav = (dir: "up" | "down"): void => { const n = navigateHistory(props.history, histRef.current, dir); histRef.current = n; setBuf(n.value, n.value.length); };

  useInput((input, key) => handleComposerInput(input, key, {
    value, cursor, activeLen, selClamped, ghost, inputAtRef, valueRef, cursorRef, selectionRef,
    setBuf, setSel, setSelection, pasteText, submitNow, insertNewline, openEditor, undo, completeNow,
    histNav, applyEdit, vimHandle, killRef, onPaste: props.onPaste,
  }), { isActive: focused });

  return <ComposerView focused={focused} slashMatches={slashMatches} atMatches={atMatches} channelMatches={channelSuggestionLabels(channelMatches)} sel={selClamped} value={value} cursor={cursor} selection={selection} placeholder={props.placeholder} pill={pill} ghost={ghost} vimMode={vimHandle.mode} />;
}

type InputCtx = {
  value: string; cursor: number; activeLen: number; selClamped: number; ghost: string;
  inputAtRef: { current: number }; valueRef: { current: string }; cursorRef: { current: number };
  selectionRef: { current: Sel | null }; killRef: { current: string };
  setBuf: (v: string, c: number) => void; setSel: (n: number) => void; setSelection: (s: Sel | null) => void;
  pasteText: (text: string) => void; submitNow: () => void; insertNewline: () => void; openEditor: () => void;
  undo: () => void; completeNow: () => void; histNav: (dir: "up" | "down") => void; applyEdit: (edit: Edit) => void;
  vimHandle: ReturnType<typeof useVim>; onPaste?: () => void;
};

function handleComposerInput(input: string, key: Key, o: InputCtx): void {
  const burst = isPasteBurst(o.inputAtRef.current);
  o.inputAtRef.current = Date.now();
  if (key.tab && key.shift) return;
  if (handleSelectionInput(input, key, o)) return;
  if (o.vimHandle.handle({ input, key, value: o.value, cursor: o.cursor, setBuf: o.setBuf })) return;
  if (isMultiLinePaste(input)) return o.pasteText(input);
  handleStandardInput(input, key, burst, o);
}

function handleStandardInput(input: string, key: Key, burst: boolean, o: InputCtx): void {
  if (handleReturnKey(key, burst, o.insertNewline, o.submitNow)) return;
  if (handleSpecialChord(input, key, { openEditor: o.openEditor, undo: o.undo, pasteText: o.pasteText, paste: o.onPaste })) return;
  if (o.activeLen > 0 && handlePaletteKey({ key, len: o.activeLen, sel: o.selClamped, setSel: o.setSel, complete: o.completeNow })) return;
  if (handleHistory(input, key, o.histNav)) return;
  handleGhostOrEdit({ input, key, ghost: o.ghost, value: o.valueRef.current, cursor: o.cursorRef.current, killRing: o.killRef.current, setBuf: o.setBuf, applyEdit: o.applyEdit });
}

function handleSelectionInput(input: string, key: Key, o: InputCtx): boolean {
  const move = extendComposerSelection(o.valueRef.current, o.cursorRef.current, o.selectionRef.current, key);
  if (move) { o.setSelection(move.selection ?? null); return true; }
  if (key.super && input === "v") return pasteClipboard(o);
  const edit = composerSelectionCommand(input, key, o.valueRef.current, o.selectionRef.current);
  if (!edit) return false;
  applySelectionEdit(edit, o);
  return true;
}

function pasteClipboard(o: InputCtx): boolean {
  const text = readClipboardText();
  if (text) o.pasteText(text); else o.onPaste?.();
  return true;
}

function applySelectionEdit(edit: ReturnType<typeof composerSelectionCommand> & {}, o: InputCtx): void {
  if (edit.clipboard !== undefined) writeClipboardText(edit.clipboard);
  edit.selection === undefined ? o.setSelection(o.selectionRef.current) : o.setSelection(edit.selection);
  if (edit.value !== o.valueRef.current || edit.cursor !== o.cursorRef.current) o.setBuf(edit.value, edit.cursor);
}

type PaletteInput = { value: string; cursor: number; files: string[]; channels?: SlackChannel[]; skills?: SlashMatch[] };

function useComposerPalettes(o: PaletteInput): { slashMatches: SlashMatch[]; atMatches: string[]; channelMatches: SlackChannel[]; activeLen: number } {
  const slashMatches = matchSlash(o.value, o.skills ?? []);
  // `#channel` and `@file` are mutually exclusive: a `#`-token under the cursor opens
  // the channel palette; otherwise we fall to the file palette (slash always wins both).
  const channelMatches = slashMatches.length === 0 ? slackCompletionFor(o.value, o.cursor, o.channels ?? []) : [];
  const atPartial = slashMatches.length === 0 && channelMatches.length === 0 ? activeAtRef(o.value) : null;
  const atMatches = atPartial !== null ? matchContextRefs(o.files, atPartial) : [];
  return { slashMatches, atMatches, channelMatches, activeLen: slashMatches.length || channelMatches.length || atMatches.length };
}

type CompleteInput = { value: string; cursor: number; slashMatches: SlashMatch[]; channelMatches: SlackChannel[]; atMatches: string[]; sel: number };

/** The buffer after Tab-completing the active palette (slash > #channel > @file). */
function completeBuffer(o: CompleteInput): string {
  if (o.slashMatches.length) return completeSlash(o.value, o.slashMatches, o.sel);
  if (o.channelMatches.length) return completeChannelRef(o.value, o.cursor, o.channelMatches, o.sel);
  return completeAtRef(o.value, o.atMatches, o.sel);
}
