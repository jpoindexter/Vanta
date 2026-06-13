import { useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { matchSlash, completeSlash, isPartialSlash } from "./slash.js";
import { activeAtRef, matchAtFiles, completeAtRef } from "./at.js";
import { readlineEdit, navigateHistory, type Key, type Edit, type HistState } from "./composer-keys.js";
import { editInEditor } from "./composer-editor.js";

// The v2 composer on real Ink's useInput. Readline/emacs chords (^A/^E/^B/^F,
// ^U/^K/^W kill, ^Y yank, ^D delete, ⌥←/→ word) live in composer-keys; here we
// own the React state and the line-level keys: Enter submits (expanding a partial
// slash command), Shift+Enter newlines, ↑/↓ walk history (or the palette when one
// is open), ^G edits the buffer in $EDITOR, ^Z undo/redo, ^V pastes a clipboard
// image. Small by construction — the fork's input layer is what ate days.

const EMPTY_HIST: HistState = { histIdx: -1, draft: "", value: "" };

export function Composer(props: {
  onSubmit: (text: string) => void;
  placeholder: string;
  files: string[];
  history: string[];
  onPaste?: () => void;
}): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const killRef = useRef("");
  const undoRef = useRef("");
  const histRef = useRef<HistState>(EMPTY_HIST);

  const slashMatches = matchSlash(value);
  const atPartial = slashMatches.length === 0 ? activeAtRef(value) : null;
  const atMatches = atPartial !== null ? matchAtFiles(props.files, atPartial) : [];
  const activeLen = slashMatches.length || atMatches.length;
  const selClamped = Math.min(sel, Math.max(0, activeLen - 1));

  const setBuf = (v: string, c: number): void => { setValue(v); setCursor(c); setSel(0); };
  const submitNow = (): void => {
    const text = (isPartialSlash(value, slashMatches) ? completeSlash(value, slashMatches, selClamped) : value).trim();
    setBuf("", 0); histRef.current = EMPTY_HIST;
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => setBuf(
    slashMatches.length ? completeSlash(value, slashMatches, selClamped) : completeAtRef(value, atMatches, selClamped),
    value.length,
  );
  const applyEdit = (e: Edit): void => { if (e.kill !== undefined) { killRef.current = e.kill; undoRef.current = value; } setBuf(e.value, e.cursor); };
  const insertNewline = (): void => setBuf(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1);
  const openEditor = (): void => { undoRef.current = value; const next = editInEditor(value); setBuf(next, next.length); };
  const undo = (): void => { const prev = undoRef.current; undoRef.current = value; setBuf(prev, prev.length); };
  const histNav = (dir: "up" | "down"): void => { const n = navigateHistory(props.history, histRef.current, dir); histRef.current = n; setBuf(n.value, n.value.length); };

  useInput((input, key) => {
    if (key.return) return void (key.shift ? insertNewline() : submitNow());
    if (handleSpecialChord(input, key, { openEditor, undo, paste: props.onPaste })) return;
    if (activeLen > 0 && handlePaletteKey({ key, len: activeLen, sel: selClamped, setSel, complete: completeNow })) return;
    if (handleHistory(input, key, histNav)) return;
    const edit = readlineEdit({ value, cursor, killRing: killRef.current }, input, key);
    if (edit) applyEdit(edit);
  });

  return <ComposerView slashMatches={slashMatches} atMatches={atMatches} sel={selClamped} value={value} cursor={cursor} placeholder={props.placeholder} />;
}

/** The palettes + the input line — pure render, split out to keep Composer small. */
function ComposerView(props: {
  slashMatches: ReturnType<typeof matchSlash>;
  atMatches: string[];
  sel: number;
  value: string;
  cursor: number;
  placeholder: string;
}): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      <SlashPalette matches={props.slashMatches} sel={props.sel} />
      <AtPalette files={props.atMatches} sel={props.sel} />
      <Box borderStyle="round" borderColor={t.border} paddingX={1}>
        <Text color={t.accent}>› </Text>
        {props.value.length === 0 ? <Text dimColor={t.dimText}>{props.placeholder}</Text> : <CursorText value={props.value} cursor={props.cursor} />}
      </Box>
    </Box>
  );
}

/** ^G edit-in-$EDITOR · ^Z undo/redo · ^V paste image. True when handled. */
function handleSpecialChord(input: string, key: Key, a: { openEditor: () => void; undo: () => void; paste?: () => void }): boolean {
  if (key.ctrl && input === "g") { a.openEditor(); return true; }
  if (key.ctrl && input === "z") { a.undo(); return true; }
  if (key.ctrl && input === "v") { a.paste?.(); return true; }
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

/** Render the value with an inverse-video block at the cursor column. */
function CursorText(props: { value: string; cursor: number }): ReactElement {
  const { value, cursor } = props;
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  return (
    <Text>
      {before}<Text inverse>{at === "\n" ? " " : at}</Text>{at === "\n" ? "\n" : ""}{after}
    </Text>
  );
}
