import { useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import { useInput } from "ink";
import { nextMode, type ApprovalMode } from "./approval-mode.js";
import type { Action } from "./app-reducer.js";

/** Note text shown when the approval mode cycles to the given value. */
function modeNoteText(mode: ApprovalMode): string {
  if (mode === "accept-edits") return "✎ accept-edits mode — file writes auto-approved · ⇧⇥ for auto";
  if (mode === "auto") return "⚡ auto-approve mode — ⇧⇥ to return to review";
  return "● review mode — approvals restored";
}

/** Cycle approval mode, keep modeRef in sync, dispatch the note. */
function cycleApprovalMode(
  setMode: Dispatch<SetStateAction<ApprovalMode>>,
  modeRef: MutableRefObject<ApprovalMode>,
  dispatch: Dispatch<Action>,
): void {
  setMode((prev) => {
    const next = nextMode(prev);
    modeRef.current = next;
    dispatch({ t: "note", text: modeNoteText(next) });
    return next;
  });
}

/** All deps passed to useKeybindings. */
export type KeybindingsDeps = {
  // slash palette
  slashHead: string | null;
  showPalette: boolean;
  matchesWithRisk: Array<{ name: string }>;
  sel: number;
  setSel: Dispatch<SetStateAction<number>>;
  // @-context palette
  atHead: string | null;
  showAtPalette: boolean;
  atMatches: string[];
  atSel: number;
  setAtSel: Dispatch<SetStateAction<number>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  // transcript / scroll / mode
  altScreen: boolean;
  maxVisible: number;
  dispatch: Dispatch<Action>;
  setMode: Dispatch<SetStateAction<ApprovalMode>>;
  modeRef: MutableRefObject<ApprovalMode>;
};

/**
 * All the composer/transcript keybindings, lifted out of App so the component
 * stays a thin shell. Called unconditionally from App every render, so the
 * useInput/useEffect hook order is stable and the closures capture current
 * values exactly as the inline form did.
 */
export function useKeybindings(d: KeybindingsDeps): void {
  // Slash palette nav.
  useEffect(() => d.setSel(0), [d.slashHead]); // eslint-disable-line react-hooks/exhaustive-deps
  useInput((_in, key) => {
    if (key.upArrow) d.setSel((s) => (s - 1 + d.matchesWithRisk.length) % d.matchesWithRisk.length);
    else if (key.downArrow) d.setSel((s) => (s + 1) % d.matchesWithRisk.length);
    else if (key.tab) d.setInput(`/${(d.matchesWithRisk[d.sel] ?? d.matchesWithRisk[0])!.name} `);
  }, { isActive: d.showPalette });

  // @-context palette nav.
  useEffect(() => d.setAtSel(0), [d.atHead]); // eslint-disable-line react-hooks/exhaustive-deps
  useInput((_in, key) => {
    if (key.upArrow) d.setAtSel((s) => (s - 1 + d.atMatches.length) % d.atMatches.length);
    else if (key.downArrow) d.setAtSel((s) => (s + 1) % d.atMatches.length);
    else if (key.tab) {
      const chosen = d.atMatches[d.atSel] ?? d.atMatches[0];
      if (chosen) d.setInput(d.input.replace(/@[\w./\-]*$/, `@${chosen} `));
    }
  }, { isActive: d.showAtPalette });

  // Ctrl+O folds/unfolds tool detail across the transcript.
  useInput((input, key) => { if (key.ctrl && input === "o") d.dispatch({ t: "toggleExpand" }); });

  // Virtual list: scroll the viewport in alt-screen mode (the alt buffer has no
  // native scrollback, so keys are the only way). pgup/pgdn (fn+↑/↓ on a Mac
  // keyboard) move half a page; shift+↑/↓ move one entry for fine control.
  useInput((_in, key) => {
    const half = Math.max(1, Math.floor(d.maxVisible / 2));
    if (key.pageUp) d.dispatch({ t: "scrollBy", delta: half });
    else if (key.pageDown) d.dispatch({ t: "scrollBy", delta: -half });
    else if (key.shift && key.upArrow) d.dispatch({ t: "scrollBy", delta: 1 });
    else if (key.shift && key.downArrow) d.dispatch({ t: "scrollBy", delta: -1 });
  }, { isActive: d.altScreen && !d.showPalette && !d.showAtPalette });

  // Shift+tab cycles the approval mode; keep modeRef in sync for requestApproval.
  useInput((_in, key) => { if (key.tab && key.shift) cycleApprovalMode(d.setMode, d.modeRef, d.dispatch); });
}
