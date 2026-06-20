import type { AgentDraft, StepId } from "./steps.js";
import { TOOL_CHOICES, LOCATION_CHOICES } from "./screens.js";

// Pure keypress → state mutation for the wizard. The wizard's useInput is kept
// thin (low complexity) by delegating to these per-mode reducers. Each returns a
// new draft/cursor; no React, no IO. The wizard owns nav keys (Enter/Esc/g) and
// only routes printable/edit/cursor keys here.

/** The subset of Ink's Key flags this layer reads. */
export type WizardKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  return?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
};

/** Which steps edit a free-text field (vs. a cursor list). */
const TEXT_FIELDS: Partial<Record<StepId, keyof AgentDraft>> = {
  type: "type",
  description: "description",
  model: "model",
  prompt: "name",
};

/** Which steps drive a cursor over an option list. */
const LIST_LENGTHS: Partial<Record<StepId, number>> = {
  tools: TOOL_CHOICES.length,
  location: LOCATION_CHOICES.length,
};

/** True when `step` edits a free-text field. */
export function isTextStep(step: StepId): boolean {
  return step in TEXT_FIELDS;
}

/** True when `step` drives an option-list cursor. */
export function isListStep(step: StepId): boolean {
  return step in LIST_LENGTHS;
}

/** Apply a printable/edit keypress to the text field a text step edits. */
export function applyTextKey(step: StepId, draft: AgentDraft, input: string, key: WizardKey): AgentDraft {
  const field = TEXT_FIELDS[step];
  if (!field) return draft;
  const current = String(draft[field] ?? "");
  if (key.backspace || key.delete) return { ...draft, [field]: current.slice(0, -1) };
  if (input && !key.ctrl && !key.meta) return { ...draft, [field]: current + input };
  return draft;
}

/** Move the list cursor for a list step; clamps within the option count. */
export function moveCursor(step: StepId, cursor: number, key: WizardKey): number {
  const len = LIST_LENGTHS[step];
  if (!len) return cursor;
  if (key.upArrow) return Math.max(0, cursor - 1);
  if (key.downArrow) return Math.min(len - 1, cursor + 1);
  return cursor;
}

/** Toggle the option under the cursor for a list step (space/select). */
export function toggleAtCursor(step: StepId, draft: AgentDraft, cursor: number): AgentDraft {
  if (step === "tools") {
    const tool = TOOL_CHOICES[cursor];
    if (!tool) return draft;
    const has = draft.tools.includes(tool);
    return { ...draft, tools: has ? draft.tools.filter((t) => t !== tool) : [...draft.tools, tool] };
  }
  if (step === "location") {
    const loc = LOCATION_CHOICES[cursor];
    return loc ? { ...draft, location: loc } : draft;
  }
  return draft;
}
