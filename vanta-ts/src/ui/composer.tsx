import { useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput, usePaste } from "ink";
import { useTheme } from "./theme.js";
import { focusIndicator } from "./focus.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { matchSlash, completeSlash, isPartialSlash, type SlashMatch } from "./slash.js";
import { activeAtRef, matchAtFiles, completeAtRef } from "./at.js";
import { readlineEdit, navigateHistory, type Key, type Edit, type HistState } from "./composer-keys.js";
import { execSync } from "node:child_process";
import { editInEditor } from "./composer-editor.js";
import { useBlink } from "./use-blink.js";

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

  const setBuf = (v: string, c: number): void => { setValue(v); setCursor(c); setSel(0); };
  const submitNow = (): void => {
    const text = (isPartialSlash(value, slashMatches) ? completeSlash(value, slashMatches, selClamped) : value).trim();
    setBuf("", 0); histRef.current = EMPTY_HIST; clearPill();
    if (text) props.onSubmit(text);
  };
  const completeNow = (): void => setBuf(
    slashMatches.length ? completeSlash(value, slashMatches, selClamped) : completeAtRef(value, atMatches, selClamped),
    value.length,
  );
  const applyEdit = (e: Edit): void => { if (e.kill !== undefined) { killRef.current = e.kill; undoRef.current = value; } setBuf(e.value, e.cursor); };
  const insertNewline = (): void => setBuf(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1);
  const openEditor = (): void => { undoRef.current = value; const next = editInEditor(value); setBuf(next, next.length); };
  const focused = props.focused ?? true;
  const pasteText = useTextPaste(value, cursor, setBuf, focused);
  const undo = (): void => { const prev = undoRef.current; undoRef.current = value; setBuf(prev, prev.length); };
  const histNav = (dir: "up" | "down"): void => { const n = navigateHistory(props.history, histRef.current, dir); histRef.current = n; setBuf(n.value, n.value.length); };

  useInput((input, key) => {
    if (key.tab && key.shift) return; // Shift+Tab is the global mode cycle (App owns it)
    if (key.return) return void (key.shift ? insertNewline() : submitNow());
    if (handleSpecialChord(input, key, { openEditor, undo, pasteText, paste: props.onPaste })) return;
    if (activeLen > 0 && handlePaletteKey({ key, len: activeLen, sel: selClamped, setSel, complete: completeNow })) return;
    if (handleHistory(input, key, histNav)) return;
    const edit = readlineEdit({ value, cursor, killRing: killRef.current }, input, key);
    if (edit) applyEdit(edit);
  }, { isActive: focused });

  return <ComposerView focused={focused} slashMatches={slashMatches} atMatches={atMatches} sel={selClamped} value={value} cursor={cursor} placeholder={props.placeholder} pill={pill} />;
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

/** The palettes + the input line — pure render, split out to keep Composer small. */
export function ComposerView(props: {
  slashMatches: ReturnType<typeof matchSlash>;
  atMatches: string[];
  sel: number;
  focused?: boolean;
  value: string;
  cursor: number;
  placeholder: string;
  pill?: { count: number; lines: number };
}): ReactElement {
  const t = useTheme();
  const blink = useBlink();
  // The Claude-method input: a single rounded-border box (not bare ─ rules), the
  // signature shape of the reference TUI. A blinking block cursor (empty + typing)
  // is the canonical "alive/ready" cue. Stretches full-width in the column.
  return (
    <Box flexDirection="column">
      <SlashPalette matches={props.slashMatches} sel={props.sel} />
      <AtPalette files={props.atMatches} sel={props.sel} />
      <Box borderStyle="round" borderColor={props.focused === false ? t.border : t.accent} paddingX={1}>
        <Text color={t.accent}>{focusIndicator(props.focused !== false)}{" "}</Text>
        {props.value.length === 0
          ? <Text><Text inverse={blink}> </Text><Text dimColor={t.dimText}>{props.placeholder}</Text></Text>
          : props.pill
            ? <PastedTextPill count={props.pill.count} lines={props.pill.lines} blink={blink} />
            : <CursorText value={props.value} cursor={props.cursor} blink={blink} />}
      </Box>
    </Box>
  );
}

function PastedTextPill({ count, lines, blink }: { count: number; lines: number; blink: boolean }): ReactElement {
  return (
    <Text>
      <Text dimColor>{"["}</Text>
      <Text>Pasted text #{count} +{lines} lines</Text>
      <Text dimColor>{"]"}</Text>
      <Text inverse={blink}>{" "}</Text>
    </Text>
  );
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

/** Render the value with a blinking inverse-video block at the cursor column
 * (when `blink` is on; the bare glyph when off — that's the cursor's dark phase). */
function CursorText(props: { value: string; cursor: number; blink: boolean }): ReactElement {
  const { value, cursor, blink } = props;
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  const glyph = at === "\n" ? " " : at;
  return (
    <Text>
      {before}<Text inverse={blink}>{glyph}</Text>{at === "\n" ? "\n" : ""}{after}
    </Text>
  );
}
