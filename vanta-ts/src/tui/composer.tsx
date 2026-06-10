import { useEffect, useRef, useState, type ReactElement } from "react";
import { Text, useInput, usePaste } from "ink";
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

export function Composer(props: ComposerProps): ReactElement {
  const { value, onChange, onSubmit, placeholder = "", isActive = true, isHistoryActive = false, history = [], color, vimEnabled = false, onVimModeChange } = props;
  const [cursor, setCursor] = useState(value.length);
  const [vimMode, setVimModeState] = useState<VimMode>("insert");
  const histRef = useRef<HistState>({ histIdx: -1, draft: "", value: "" });
  // Large pastes collapse to a [Pasted text #N …] ref here, expanded on submit.
  const pasteStore = useRef(newPasteStore());
  // Kill ring: the last text killed by Ctrl+U/W/K, yanked back by Ctrl+Y.
  // Persists across clears (emacs-like) — intentionally NOT reset in the effect below.
  const killRing = useRef("");

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

      // Cursor movement. Char: left/right or Ctrl+B/F. Line ends: Ctrl+A/E.
      // Word: Alt/Option+B/F (run of non-space, stops at newlines). Up/down/Tab
      // are left for the slash palette.
      if (key.leftArrow || (key.ctrl && input === "b")) return setCursor((c) => Math.max(0, c - 1));
      if (key.rightArrow || (key.ctrl && input === "f")) return setCursor((c) => Math.min(value.length, c + 1));
      if (key.ctrl && input === "a") return setCursor(0);
      if (key.ctrl && input === "e") return setCursor(value.length);
      if (key.meta && input === "b") return setCursor((c) => wordLeft(value, c));
      if (key.meta && input === "f") return setCursor((c) => wordRight(value, c));

      // Kill-to-start (Ctrl+U) — the reliable "clear the line". Feeds the kill ring.
      if (key.ctrl && input === "u") {
        const r = killToStart(value, cursor);
        killRing.current = r.killed;
        onChange(r.value);
        return setCursor(r.cursor);
      }
      // Kill-to-end (Ctrl+K). Feeds the kill ring.
      if (key.ctrl && input === "k") {
        const r = killToEnd(value, cursor);
        killRing.current = r.killed;
        return onChange(r.value);
      }

      // Delete word before cursor: Ctrl+W or Option/Alt+Backspace. Feeds the kill ring.
      if ((key.ctrl && input === "w") || (key.meta && (key.backspace || key.delete))) {
        const r = killWordBack(value, cursor);
        killRing.current = r.killed;
        onChange(r.value);
        return setCursor(r.cursor);
      }

      // Forward-delete the char under the cursor (Ctrl+D). On EMPTY input this is a
      // no-op — exit is handled elsewhere (Esc), so Ctrl+D never quits the session.
      if (key.ctrl && input === "d") {
        if (value.length === 0) return;
        return onChange(deleteForward(value, cursor));
      }

      // Yank (Ctrl+Y) — paste the last killed text at the cursor.
      if (key.ctrl && input === "y") {
        const r = yank(value, cursor, killRing.current);
        onChange(r.value);
        return setCursor(r.cursor);
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

  // Bracketed paste. Ink enables paste mode while this hook is active and
  // delivers the WHOLE paste as one event on a separate channel — so a paste's
  // embedded newlines can never be misread by useInput as Enter (the "repasted
  // several times" multi-submit bug). Large pastes still collapse to a ref.
  usePaste(
    (pasted) => {
      const insert = shouldCollapse(pasted) ? collapse(pasteStore.current, pasted) : pasted;
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
