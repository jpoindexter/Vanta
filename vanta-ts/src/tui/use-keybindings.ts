import { useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from "react";
import { nextMode, type ApprovalMode } from "./approval-mode.js";
import { useKeybinding } from "./keybinding/use-keybinding.js";
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
  // transcript fold / approval mode / exit
  dispatch: Dispatch<Action>;
  setMode: Dispatch<SetStateAction<ApprovalMode>>;
  modeRef: MutableRefObject<ApprovalMode>;
  exit: () => void;
  /** True while a modal overlay is open — suppresses ⇧⇥ approval-mode cycling so
   *  the mission-control "tabs" context can own ⇧⇥ without a double-fire. */
  overlayActive: boolean;
};

/**
 * All the composer/transcript keybindings, lifted out of App so the component
 * stays a thin shell. Called unconditionally from App every render, so the
 * useInput/useEffect hook order is stable and the closures capture current
 * values exactly as the inline form did.
 */
export function useKeybindings(d: KeybindingsDeps): void {
  // Slash palette nav — chords resolved from the registry (palette.* actions).
  useEffect(() => d.setSel(0), [d.slashHead]); // eslint-disable-line react-hooks/exhaustive-deps
  useKeybinding("palette.prev", () => d.setSel((s) => (s - 1 + d.matchesWithRisk.length) % d.matchesWithRisk.length), { isActive: d.showPalette });
  useKeybinding("palette.next", () => d.setSel((s) => (s + 1) % d.matchesWithRisk.length), { isActive: d.showPalette });
  useKeybinding("palette.complete", () => d.setInput(`/${(d.matchesWithRisk[d.sel] ?? d.matchesWithRisk[0])!.name} `), { isActive: d.showPalette });

  // @-context palette nav.
  useEffect(() => d.setAtSel(0), [d.atHead]); // eslint-disable-line react-hooks/exhaustive-deps
  useKeybinding("atPalette.prev", () => d.setAtSel((s) => (s - 1 + d.atMatches.length) % d.atMatches.length), { isActive: d.showAtPalette });
  useKeybinding("atPalette.next", () => d.setAtSel((s) => (s + 1) % d.atMatches.length), { isActive: d.showAtPalette });
  useKeybinding("atPalette.complete", () => {
    const chosen = d.atMatches[d.atSel] ?? d.atMatches[0];
    if (chosen) d.setInput(d.input.replace(/@[\w./\-]*$/, `@${chosen} `));
  }, { isActive: d.showAtPalette });

  // Transcript fold / unfold tool detail (^O).
  useKeybinding("transcript.toggleExpand", () => d.dispatch({ t: "toggleExpand" }));

  // ^C exits. The renderer's built-in exitOnCtrlC only matches a RAW \x03 byte —
  // under the kitty keyboard protocol (Ghostty, iTerm2, kitty) ^C arrives as a
  // CSI-u key event and never hits that check, so bind it here like upstream.
  useKeybinding("app.exit", () => d.exit());

  // Scrolling lives in use-scroll-keys.ts (registry transcript.scroll* + wheel).

  // ⇧⇥ cycles the approval mode; keep modeRef in sync for requestApproval.
  // Suppressed while an overlay is open so mission-control's tabs.prev owns ⇧⇥.
  useKeybinding("app.cycleApprovalMode", () => cycleApprovalMode(d.setMode, d.modeRef, d.dispatch), { isActive: !d.overlayActive });
}
