import { actionForChord } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

export const KEYBINDING_CONTEXTS = [
  "global",
  "chat",
  "autocomplete",
  "confirmation",
  "help",
  "transcript",
  "historySearch",
  "task",
  "themePicker",
  "settings",
  "tabs",
  "attachments",
  "footer",
  "messageSelector",
  "diffDialog",
  "modelPicker",
  "select",
  "plugin",
] as const;

export type KeybindingContext = typeof KEYBINDING_CONTEXTS[number];

export type ActiveContextState = {
  quickOpen?: boolean;
  globalSearch?: boolean;
  messageActions?: boolean;
  pending?: boolean;
  overlayKind?: string | null;
  transcriptSelection?: boolean;
  autocomplete?: boolean;
  attachments?: boolean;
};

export function keybindingContexts(): readonly KeybindingContext[] {
  return KEYBINDING_CONTEXTS;
}

const OVERLAY_CONTEXT: Record<string, KeybindingContext[]> = {
  review: ["diffDialog"],
  help: ["help"],
  config: ["settings"],
  outputStyle: ["themePicker"],
  pluginPanel: ["plugin"],
  list: ["select"],
  tasks: ["select"],
  teams: ["select"],
  workflowSelect: ["select"],
  agentEditor: ["select"],
};

function addWhen(out: KeybindingContext[], condition: unknown, context: KeybindingContext): void {
  if (condition) out.push(context);
}

export function activeKeybindingContexts(state: ActiveContextState): KeybindingContext[] {
  const contexts: KeybindingContext[] = [];
  addWhen(contexts, state.pending, "confirmation");
  contexts.push(...(OVERLAY_CONTEXT[state.overlayKind ?? ""] ?? []));
  addWhen(contexts, state.quickOpen, "select");
  addWhen(contexts, state.globalSearch, "historySearch");
  addWhen(contexts, state.messageActions, "messageSelector");
  addWhen(contexts, state.transcriptSelection, "transcript");
  addWhen(contexts, state.autocomplete, "autocomplete");
  addWhen(contexts, state.attachments, "attachments");
  contexts.push("chat", "footer", "tabs", "task", "global");
  return [...new Set(contexts)];
}

export function actionForChordInContexts(bindings: KeyBinding[], chord: string, contexts: readonly string[] = ["global"]): string | null {
  for (const context of contexts) {
    const action = actionForChord(bindings, chord, context);
    if (action) return action;
  }
  return null;
}
