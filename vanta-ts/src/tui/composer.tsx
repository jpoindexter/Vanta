import { useEffect, useRef, useState, type ReactElement } from "react";
import { Text, useInput } from "ink";
import { newPasteStore, shouldCollapse, collapse, expandPastes } from "./paste.js";

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

/** Delete the word (and any trailing whitespace) immediately before `pos`. */
function deleteWordBefore(value: string, pos: number): { value: string; pos: number } {
  let i = pos;
  while (i > 0 && /\s/.test(value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(value[i - 1]!)) i--;
  return { value: value.slice(0, i) + value.slice(pos), pos: i };
}

export function Composer(props: ComposerProps): ReactElement {
  const { value, onChange, onSubmit, placeholder = "", isActive = true, isHistoryActive = false, history = [], color, vimEnabled = false, onVimModeChange } = props;
  const [cursor, setCursor] = useState(value.length);
  const [vimMode, setVimModeState] = useState<VimMode>("insert");
  const histRef = useRef<HistState>({ histIdx: -1, draft: "", value: "" });
  // Large pastes collapse to a [Pasted text #N …] ref here, expanded on submit.
  const pasteStore = useRef(newPasteStore());

  const setVimMode = (m: VimMode): void => {
    setVimModeState(m);
    onVimModeChange?.(m);
  };

  // Keep the cursor inside the value when the parent rewrites it (e.g. clears on
  // submit, or tab-completes a slash command). Also reset history navigation on clear.
  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
    if (value === "") {
      histRef.current = { histIdx: -1, draft: "", value: "" };
      pasteStore.current = newPasteStore();
    }
  }, [value]);

  useInput(
    (input, key) => {
      // Vim normal mode key handling — only active when vim is enabled.
      if (vimEnabled && vimMode === "normal") {
        if (input === "i") { setVimMode("insert"); return; }
        if (input === "a") { setCursor((c) => Math.min(value.length, c + 1)); setVimMode("insert"); return; }
        if (input === "I") { setCursor(0); setVimMode("insert"); return; }
        if (input === "A") { setCursor(value.length); setVimMode("insert"); return; }
        if (input === "h" || key.leftArrow) { setCursor((c) => Math.max(0, c - 1)); return; }
        if (input === "l" || key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return; }
        if (input === "0") { setCursor(0); return; }
        if (input === "$") { setCursor(value.length); return; }
        if (input === "x") {
          if (cursor < value.length) { onChange(value.slice(0, cursor) + value.slice(cursor + 1)); }
          return;
        }
        if (key.return) return onSubmit(expandPastes(value, pasteStore.current)); // Enter submits even in normal mode
        return; // ignore all other keys in normal mode
      }
      // Insert mode: Esc exits to normal when vim enabled.
      if (vimEnabled && vimMode === "insert" && key.escape) { setVimMode("normal"); return; }

      // Multiline: shift+enter inserts \n at cursor (modern terminals only).
      if (key.shift && key.return) {
        onChange(value.slice(0, cursor) + "\n" + value.slice(cursor));
        setCursor((c) => c + 1);
        return;
      }

      // Submit (plain enter — shift+enter handled above). Expand collapsed pastes.
      if (key.return) return onSubmit(expandPastes(value, pasteStore.current));

      // History navigation — only when the slash palette is not open.
      if (isHistoryActive && key.upArrow) {
        const next = navigateHistory(history, histRef.current, "up");
        histRef.current = next;
        onChange(next.value);
        setCursor(next.value.length);
        return;
      }
      if (isHistoryActive && key.downArrow) {
        const next = navigateHistory(history, histRef.current, "down");
        histRef.current = next;
        onChange(next.value);
        setCursor(next.value.length);
        return;
      }

      // Cursor movement (left/right + home/end). Up/down/Tab are left for the
      // slash palette.
      if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1));
      if (key.rightArrow) return setCursor((c) => Math.min(value.length, c + 1));
      if (key.ctrl && input === "a") return setCursor(0);
      if (key.ctrl && input === "e") return setCursor(value.length);

      // Kill-to-start (Ctrl+U) — the reliable "clear the line".
      if (key.ctrl && input === "u") {
        onChange(value.slice(cursor));
        return setCursor(0);
      }
      // Kill-to-end (Ctrl+K).
      if (key.ctrl && input === "k") return onChange(value.slice(0, cursor));

      // Delete word before cursor: Ctrl+W or Option/Alt+Backspace.
      if ((key.ctrl && input === "w") || (key.meta && (key.backspace || key.delete))) {
        const r = deleteWordBefore(value, cursor);
        onChange(r.value);
        return setCursor(r.pos);
      }

      // Delete the char before the cursor.
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        onChange(value.slice(0, cursor - 1) + value.slice(cursor));
        return setCursor((c) => c - 1);
      }

      // Ignore remaining control/navigation keys.
      if (!input || key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.escape) return;

      // Insert printable text at the cursor. A large block (a paste delivered as
      // one event) collapses to a [Pasted text #N …] ref, expanded on submit.
      const insert = shouldCollapse(input) ? collapse(pasteStore.current, input) : input;
      onChange(value.slice(0, cursor) + insert + value.slice(cursor));
      setCursor((c) => c + insert.length);
    },
    { isActive },
  );

  if (value.length === 0) {
    return (
      <Text>
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  const c = Math.min(cursor, value.length);
  const before = value.slice(0, c);
  const at = value[c] ?? " ";
  const after = value.slice(c + 1);
  return (
    <Text color={color}>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}
