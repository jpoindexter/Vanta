import type { Key } from "./composer-keys.js";
import {
  deleteSelection, extendSelection, replaceSelection, selEmpty, selectAll,
  selectedText, type Sel, type SelMotion,
} from "./selection.js";

export type SelectionEdit = { value: string; cursor: number; selection?: Sel | null; clipboard?: string };

export function selectionMotionForKey(key: Key): SelMotion | null {
  if (!key.shift) return null;
  if (key.meta && key.leftArrow) return "wordLeft";
  if (key.meta && key.rightArrow) return "wordRight";
  if (key.leftArrow) return "charLeft";
  if (key.rightArrow) return "charRight";
  if (key.upArrow) return "lineUp";
  if (key.downArrow) return "lineDown";
  return null;
}

export function extendComposerSelection(value: string, cursor: number, selection: Sel | null, key: Key): SelectionEdit | null {
  const motion = selectionMotionForKey(key);
  if (!motion) return null;
  const next = extendSelection(value, selection, cursor, motion);
  return { value, cursor: next.cursor, selection: selEmpty(next) ? null : next };
}

export function composerSelectionCommand(input: string, key: Key, value: string, selection: Sel | null): SelectionEdit | null {
  if (key.super && input === "a") return { value, cursor: value.length, selection: selectAll(value) };
  if (selEmpty(selection)) return null;
  if (key.super && input === "c") return { value, cursor: selection.cursor, selection, clipboard: selectedText(value, selection) };
  if (key.super && input === "x") {
    const next = deleteSelection(value, selection);
    return { ...next, clipboard: selectedText(value, selection), selection: null };
  }
  if (key.backspace || key.delete) return { ...deleteSelection(value, selection), selection: null };
  if (isPrintableSelectionInput(input, key)) return { ...replaceSelection(value, selection, input), selection: null };
  return null;
}

function isPrintableSelectionInput(input: string, key: Key): boolean {
  return Boolean(input) && !key.ctrl && !key.meta && !key.super && !key.tab && !key.upArrow && !key.downArrow && !key.escape && !key.return;
}
