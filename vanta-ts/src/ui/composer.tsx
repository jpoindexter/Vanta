import { useRef, useState, type ReactElement } from "react";
import { useInput, usePaste } from "ink";
import { matchSlash, completeSlash, isPartialSlash, type SlashMatch } from "./slash.js";
import { activeAtRef, matchAtFiles, completeAtRef } from "./at.js";
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

export function Composer(props: {
  onSubmit: (text: string) => void;
  placeholder: string;
  files: string[];
  history: string[];
  onPaste?: () => void;
  skills?: SlashMatch[];
  focused?: boolean;
  vim?: boolean;
}): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const killRef = useRef("");
  const undoRef = useRef("");
  const histRef = useRef<HistState>(EMPTY_HIST);
  const { pill, clearPill } = usePastePill(value);
  const { slashMatches, atMatches, activeLen } = useComposerPalettes(value, props.files, props.skills);
  const selClamped = Math.min(sel, Math.max(0, activeLen - 1));
  const ghost = activeLen === 0 && histRef.current.histIdx === -1 && cursor === value.length ? historyTypeahead(props.history, value) : "";

  const focused = props.focused ?? true;
  const vimHandle = useVim((props.vim ?? false) && focused);
  const setBuf = (v: string, c: number): void => { setValue(v); setCursor(c); setSel(0); };
  const submitNow = (): void => {
    const text = (isPartialSlash(value, slashMatches) ? completeSlash(value, slashMatches, selClamped) : value).trim();
    setBuf("", 0); histRef.current = EMPTY_HIST; clearPill(); vimHandle.reset();
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => setBuf(slashMatches.length ? completeSlash(value, slashMatches, selClamped) : completeAtRef(value, atMatches, selClamped), value.length);
  const applyEdit = (e: Edit): void => { if (e.kill !== undefined) { killRef.current = e.kill; undoRef.current = value; } setBuf(e.value, e.cursor); };
  const insertNewline = (): void => setBuf(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1);
  const openEditor = (): void => { undoRef.current = value; const next = editInEditor(value); setBuf(next, next.length); };
  const pasteText = useTextPaste(value, cursor, setBuf, focused);
  const undo = (): void => { const prev = undoRef.current; undoRef.current = value; setBuf(prev, prev.length); };
  const histNav = (dir: "up" | "down"): void => { const n = navigateHistory(props.history, histRef.current, dir); histRef.current = n; setBuf(n.value, n.value.length); };

  useInput((input, key) => {
    if (key.tab && key.shift) return; // Shift+Tab is the global mode cycle (App owns it)
    if (vimHandle.handle({ input, key, value, cursor, setBuf })) return; // vi normal mode owns the key; insert falls through
    if (handleReturnKey(key, insertNewline, submitNow)) return;
    if (handleSpecialChord(input, key, { openEditor, undo, pasteText, paste: props.onPaste })) return;
    if (activeLen > 0 && handlePaletteKey({ key, len: activeLen, sel: selClamped, setSel, complete: completeNow })) return;
    if (handleHistory(input, key, histNav)) return;
    handleGhostOrEdit({ input, key, ghost, value, cursor, killRing: killRef.current, setBuf, applyEdit });
  }, { isActive: focused });

  return <ComposerView focused={focused} slashMatches={slashMatches} atMatches={atMatches} sel={selClamped} value={value} cursor={cursor} placeholder={props.placeholder} pill={pill} ghost={ghost} vimMode={vimHandle.mode} />;
}

function useComposerPalettes(value: string, files: string[], skills?: SlashMatch[]): { slashMatches: SlashMatch[]; atMatches: string[]; activeLen: number } {
  const slashMatches = matchSlash(value, skills ?? []);
  const atPartial = slashMatches.length === 0 ? activeAtRef(value) : null;
  const atMatches = atPartial !== null ? matchAtFiles(files, atPartial) : [];
  return { slashMatches, atMatches, activeLen: slashMatches.length || atMatches.length };
}

function useTextPaste(value: string, cursor: number, setBuf: (v: string, c: number) => void, focused: boolean): (text: string) => void {
  const pasteText = (text: string): void => {
    if (!focused) return;
    const next = value.slice(0, cursor) + text + value.slice(cursor);
    setBuf(next, cursor + text.length);
  };
  // Bracketed paste mode: text with newlines arrives as one string, not returns.
  usePaste(pasteText);
  return pasteText;
}

function usePastePill(value: string): { pill?: { count: number; lines: number }; clearPill: () => void } {
  const pasteCountRef = useRef(0);
  const wasPillRef = useRef(false);
  const lineCount = countLines(value);
  const isPill = lineCount > PASTE_PILL_THRESHOLD;
  if (isPill && !wasPillRef.current) pasteCountRef.current++;
  wasPillRef.current = isPill;
  return {
    pill: isPill ? { count: pasteCountRef.current, lines: lineCount } : undefined,
    clearPill: () => { wasPillRef.current = false; },
  };
}

/** Enter submits (or shift+enter newlines). True when handled. */
function handleReturnKey(key: Key, insertNewline: () => void, submitNow: () => void): boolean {
  if (!key.return) return false;
  key.shift ? insertNewline() : submitNow();
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
