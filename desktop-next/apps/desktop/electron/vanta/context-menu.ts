import { z } from "zod";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";

const MAX_WORD = 100;
const EDIT_COMMANDS = ["copy", "cut", "paste", "selectAll"] as const;
const editSchema = z.enum(EDIT_COMMANDS);
const spellcheckSchema = z.object({ kind: z.enum(["add", "replace"]), word: z.string().trim().min(1).max(MAX_WORD) });

/** The slice of webContents the page's own context menu acts on; a fake in tests. */
export interface MenuContents {
  copy: () => void;
  copyImageAt: (x: number, y: number) => void;
  cut: () => void;
  id: number;
  on: (event: "context-menu", listener: (event: unknown, params: ContextParams) => void) => unknown;
  paste: () => void;
  replaceMisspelling: (word: string) => void;
  selectAll: () => void;
  send: (channel: string, payload: unknown) => void;
  session: { addWordToSpellCheckerDictionary: (word: string) => boolean };
}

export interface ContextParams {
  dictionarySuggestions?: string[];
  isEditable?: boolean;
  misspelledWord?: string;
  x: number;
  y: number;
}

/**
 * The page draws its own context menu; main keeps only what Chromium reports and the page cannot see: the
 * spelling facts and the click position (needed to copy the image under it). The verbs act on the window that asked.
 */
export function registerContextMenu(ipc: IpcLike) {
  const lastPoint = new Map<number, { x: number; y: number }>();
  const contentsOf = (sender: unknown) => sender as MenuContents;

  ipc.handle(CH.contextMenuEdit, (event, command: unknown) => {
    const parsed = editSchema.safeParse(command);

    if (parsed.success) {
      contentsOf(event.sender)[parsed.data]();
    }
  });

  ipc.handle(CH.contextMenuCopyImage, event => {
    const point = lastPoint.get(contentsOf(event.sender).id);

    if (point) {
      contentsOf(event.sender).copyImageAt(point.x, point.y);
    }
  });

  ipc.handle(CH.contextMenuSpellcheck, (event, action: unknown) => {
    const parsed = spellcheckSchema.safeParse(action);

    if (!parsed.success) {
      return;
    }

    if (parsed.data.kind === "replace") {
      contentsOf(event.sender).replaceMisspelling(parsed.data.word);
    } else {
      contentsOf(event.sender).session.addWordToSpellCheckerDictionary(parsed.data.word);
    }
  });

  return {
    /** Called for each window: remember where the user clicked and forward the spelling facts. */
    attach: (contents: MenuContents): void => {
      contents.on("context-menu", (_event, params) => {
        lastPoint.set(contents.id, { x: params.x, y: params.y });

        if (params.isEditable && params.misspelledWord) {
          contents.send(CH.contextMenuSpellcheckInfo, {
            misspelledWord: params.misspelledWord,
            suggestions: Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions.slice(0, 10) : []
          });
        }
      });
    }
  };
}
