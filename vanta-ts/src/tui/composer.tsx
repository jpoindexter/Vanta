import { useEffect, useRef, useState, type ReactElement } from "react";
import { Text, useInput, usePaste, type Key } from "ink";
import { newPasteStore, shouldCollapse, collapse, expandPastes } from "./paste.js";
import {
  wordLeft,
  wordRight,
  killToStart,
  killToEnd,
  killWordBack,
  deleteForward,
  yank,
} from "./composer-edits.js";

export type VimMode = "normal" | "insert";

// Composer with readline/emacs key bindings + input history + multiline.
// Value is controlled by the parent (the slash palette reads it); cursor is
// local. Up/down navigate history when isHistoryActive; when the palette is
// showing the palette's own useInput takes over selection.

export type ComposerProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isActive?: boolean;
  isHistoryActive?: boolean;
  history?: string[];
  color?: string;
  vimEnabled?: boolean;
  onVimModeChange?: (mode: VimMode) => void;
};

// Pure helper — tested directly.
export type HistState = { histIdx: number; draft: string; value: string };
export function navigateHistory(history: string[], state: HistState, dir: "up" | "down"): HistState {
  if (dir === "up") {
    if (history.length === 0) return state;
    const draft = state.histIdx === -1 ? state.value : state.draft;
    const histIdx = Math.min(state.histIdx + 1, history.length - 1);
    return { histIdx, draft, value: history[history.length - 1 - histIdx] ?? "" };
  }
  if (state.histIdx <= 0) return { histIdx: -1, draft: "", value: state.draft };
  const histIdx = state.histIdx - 1;
  return { ...state, histIdx, value: history[history.length - 1 - histIdx] ?? "" };
}

// ─── key-handler context ───────────────────────────────────────────────────

type HandlerCtx = {
  value: string;
  cursor: number;
  vimMode: VimMode;
  vimEnabled: boolean;
  isHistoryActive: boolean;
  history: string[];
  histRef: React.MutableRefObject<HistState>;
  killRing: React.MutableRefObject<string>;
  pasteStore: React.MutableRefObject<ReturnType<typeof newPasteStore>>;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  setCursor: React.Dispatch<React.SetStateAction<number>>;
  setVimMode: (m: VimMode) => void;
};

// ─── dispatch-table helpers ────────────────────────────────────────────────

type KeyEntry = { match: (i: string, k: Key) => boolean; run: (i: string, ctx: HandlerCtx) => void };

// Runs the first matching entry in a table; returns true if matched.
function runTable(table: KeyEntry[], input: string, key: Key, ctx: HandlerCtx): boolean {
  const entry = table.find((e) => e.match(input, key));
  if (entry) { entry.run(input, ctx); return true; }
  return false;
}

// ─── vim normal-mode dispatch table ───────────────────────────────────────

const VIM_NORMAL_TABLE: KeyEntry[] = [
  { match: (i) => i === "i", run: (_, c) => c.setVimMode("insert") },
  { match: (i) => i === "a", run: (_, c) => { c.setCursor((p) => Math.min(c.value.length, p + 1)); c.setVimMode("insert"); } },
  { match: (i) => i === "I", run: (_, c) => { c.setCursor(0); c.setVimMode("insert"); } },
  { match: (i) => i === "A", run: (_, c) => { c.setCursor(c.value.length); c.setVimMode("insert"); } },
  { match: (i, k) => i === "h" || k.leftArrow, run: (_, c) => c.setCursor((p) => Math.max(0, p - 1)) },
  { match: (i, k) => i === "l" || k.rightArrow, run: (_, c) => c.setCursor((p) => Math.min(c.value.length, p + 1)) },
  { match: (i) => i === "0", run: (_, c) => c.setCursor(0) },
  { match: (i) => i === "$", run: (_, c) => c.setCursor(c.value.length) },
  { match: (i) => i === "x", run: (_, c) => { if (c.cursor < c.value.length) c.onChange(c.value.slice(0, c.cursor) + c.value.slice(c.cursor + 1)); } },
  { match: (_, k) => k.return, run: (_, c) => c.onSubmit(expandPastes(c.value, c.pasteStore.current)) },
];

function handleVimNormal(input: string, key: Key, ctx: HandlerCtx): boolean {
  if (!ctx.vimEnabled || ctx.vimMode !== "normal") return false;
  runTable(VIM_NORMAL_TABLE, input, key, ctx);
  return true; // always consumed in normal mode
}

// ─── insert-mode movement + kill-ring dispatch tables ─────────────────────

const MOVEMENT_TABLE: KeyEntry[] = [
  { match: (i, k) => k.leftArrow || (k.ctrl && i === "b"), run: (_, c) => c.setCursor((p) => Math.max(0, p - 1)) },
  { match: (i, k) => k.rightArrow || (k.ctrl && i === "f"), run: (_, c) => c.setCursor((p) => Math.min(c.value.length, p + 1)) },
  { match: (i, k) => k.ctrl && i === "a", run: (_, c) => c.setCursor(0) },
  { match: (i, k) => k.ctrl && i === "e", run: (_, c) => c.setCursor(c.value.length) },
  { match: (i, k) => k.meta && i === "b", run: (_, c) => c.setCursor((p) => wordLeft(c.value, p)) },
  { match: (i, k) => k.meta && i === "f", run: (_, c) => c.setCursor((p) => wordRight(c.value, p)) },
];

const KILL_YANK_TABLE: KeyEntry[] = [
  { match: (i, k) => k.ctrl && i === "u", run: (_, c) => { const r = killToStart(c.value, c.cursor); c.killRing.current = r.killed; c.onChange(r.value); c.setCursor(r.cursor); } },
  { match: (i, k) => k.ctrl && i === "k", run: (_, c) => { const r = killToEnd(c.value, c.cursor); c.killRing.current = r.killed; c.onChange(r.value); } },
  { match: (i, k) => (k.ctrl && i === "w") || (k.meta && (k.backspace || k.delete)), run: (_, c) => { const r = killWordBack(c.value, c.cursor); c.killRing.current = r.killed; c.onChange(r.value); c.setCursor(r.cursor); } },
  { match: (i, k) => k.ctrl && i === "d", run: (_, c) => { if (c.value.length > 0) c.onChange(deleteForward(c.value, c.cursor)); } },
  { match: (i, k) => k.ctrl && i === "y", run: (_, c) => { const r = yank(c.value, c.cursor, c.killRing.current); c.onChange(r.value); c.setCursor(r.cursor); } },
];

// ─── insert-mode submit/history/backspace section ─────────────────────────
// Separated from handleKeyInput so that fn's complexity stays ≤10.

function applyHistoryNav(ctx: HandlerCtx, dir: "up" | "down"): true {
  const next = navigateHistory(ctx.history, ctx.histRef.current, dir);
  ctx.histRef.current = next; ctx.onChange(next.value); ctx.setCursor(next.value.length);
  return true;
}

function handleHistoryNav(input: string, key: Key, ctx: HandlerCtx): boolean {
  // ^P/^N (readline previous/next) always reach history — including with an
  // empty composer, where plain ↑/↓ scroll the transcript instead.
  if (key.ctrl && input === "p") return applyHistoryNav(ctx, "up");
  if (key.ctrl && input === "n") return applyHistoryNav(ctx, "down");
  if (!ctx.isHistoryActive) return false;
  if (key.upArrow) return applyHistoryNav(ctx, "up");
  if (key.downArrow) return applyHistoryNav(ctx, "down");
  return false;
}

function handleInsertSubmitHistory(input: string, key: Key, ctx: HandlerCtx): boolean {
  const inInsert = ctx.vimEnabled && ctx.vimMode === "insert";
  if (inInsert && key.escape) { ctx.setVimMode("normal"); return true; }
  if (key.shift && key.return) {
    ctx.onChange(ctx.value.slice(0, ctx.cursor) + "\n" + ctx.value.slice(ctx.cursor));
    ctx.setCursor((c) => c + 1);
    return true;
  }
  if (key.return) { ctx.onSubmit(expandPastes(ctx.value, ctx.pasteStore.current)); return true; }
  return handleHistoryNav(input, key, ctx);
}

// SGR mouse-report fragment (wheel events while mouse reporting is on) — must
// never be inserted as text if one leaks through Ink's key parser.
const MOUSE_SEQ_RE = /\[<\d+;\d+;\d+[Mm]/;

// Returns true when the key is a non-printable control that should be ignored.
function isIgnoredKey(input: string, key: Key): boolean {
  return !input || key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.escape || MOUSE_SEQ_RE.test(input);
}

function handleInsertChar(input: string, key: Key, ctx: HandlerCtx): void {
  if (key.backspace || key.delete) {
    if (ctx.cursor === 0) return;
    ctx.onChange(ctx.value.slice(0, ctx.cursor - 1) + ctx.value.slice(ctx.cursor));
    ctx.setCursor((c) => c - 1);
    return;
  }
  if (isIgnoredKey(input, key)) return;
  const insert = shouldCollapse(input) ? collapse(ctx.pasteStore.current, input) : input;
  ctx.onChange(ctx.value.slice(0, ctx.cursor) + insert + ctx.value.slice(ctx.cursor));
  ctx.setCursor((c) => c + insert.length);
}

// Main dispatch — thin; delegates to focused helpers.
function handleKeyInput(input: string, key: Key, ctx: HandlerCtx): void {
  if (handleVimNormal(input, key, ctx)) return;
  if (handleInsertSubmitHistory(input, key, ctx)) return;
  if (runTable(MOVEMENT_TABLE, input, key, ctx)) return;
  if (runTable(KILL_YANK_TABLE, input, key, ctx)) return;
  handleInsertChar(input, key, ctx);
}

// ─── render helpers ────────────────────────────────────────────────────────

type DisplayProps = { value: string; cursor: number; color?: string; placeholder: string };
function ComposerDisplay({ value, cursor, color, placeholder }: DisplayProps): ReactElement {
  if (value.length === 0) {
    return (
      <Text>
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }
  const c = Math.min(cursor, value.length);
  return (
    <Text color={color}>
      {value.slice(0, c)}
      <Text inverse>{value[c] ?? " "}</Text>
      {value.slice(c + 1)}
    </Text>
  );
}

// ─── component ────────────────────────────────────────────────────────────

export function Composer(props: ComposerProps): ReactElement {
  const { value, onChange, onSubmit, placeholder = "", isActive = true, isHistoryActive = false, history = [], color, vimEnabled = false, onVimModeChange } = props;
  const [cursor, setCursor] = useState(value.length);
  const [vimMode, setVimModeState] = useState<VimMode>("insert");
  const histRef = useRef<HistState>({ histIdx: -1, draft: "", value: "" });
  const pasteStore = useRef(newPasteStore());
  // Kill ring persists across clears (emacs-like) — intentionally NOT reset on value clear.
  const killRing = useRef("");
  const setVimMode = (m: VimMode): void => { setVimModeState(m); onVimModeChange?.(m); };

  // Keep cursor inside value when parent rewrites it; reset history nav on clear.
  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
    if (value === "") { histRef.current = { histIdx: -1, draft: "", value: "" }; pasteStore.current = newPasteStore(); }
  }, [value]);

  useInput(
    (input, key) => handleKeyInput(input, key, { value, cursor, vimMode, vimEnabled, isHistoryActive, history, histRef, killRing, pasteStore, onChange, onSubmit, setCursor, setVimMode }),
    { isActive },
  );

  // Bracketed paste — Ink delivers the whole paste on a separate channel so
  // embedded newlines can't be misread as Enter. Large pastes collapse to a ref.
  usePaste(
    (pasted) => {
      const insert = shouldCollapse(pasted) ? collapse(pasteStore.current, pasted) : pasted;
      onChange(value.slice(0, cursor) + insert + value.slice(cursor));
      setCursor((c) => c + insert.length);
    },
    { isActive },
  );

  return <ComposerDisplay value={value} cursor={cursor} color={color} placeholder={placeholder} />;
}
