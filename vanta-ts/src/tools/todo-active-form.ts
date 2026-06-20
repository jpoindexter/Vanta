// VANTA-TODO-ACTIVE-FORM — pure helpers for the optional present-continuous
// `activeForm` label on a todo item. An in-progress item reads more naturally as
// its active form ("Running the tests") than its imperative content ("Run the
// tests"); any other status, or an absent/blank active form, falls back to the
// content so display is byte-identical to before.

/** The subset of a todo item these pure helpers read. */
export interface ActiveFormItem {
  readonly text: string;
  readonly status: "pending" | "in_progress" | "done";
  readonly activeForm?: string;
}

/**
 * Normalize a raw optional `activeForm` value: trim it; treat an empty or
 * whitespace-only string (and any non-string) as absent (`undefined`).
 */
export function normalizeActiveForm(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The label to display for a todo item: its `activeForm` only when the item is
 * `in_progress` AND its active form is non-empty; otherwise its `content`
 * (`text`). Pending/done items always show their content, even if an active
 * form is set.
 */
export function displayLabel(item: ActiveFormItem): string {
  if (item.status === "in_progress") {
    const active = normalizeActiveForm(item.activeForm);
    if (active) return active;
  }
  return item.text;
}
