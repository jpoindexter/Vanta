// UserPromptSubmit hook → session title.
//
// A UserPromptSubmit hook may emit a `sessionTitle` field in its JSON stdout to
// rename the active session. Both functions are pure (no I/O, never throw) so
// the parse + title-resolution can be unit-tested in isolation; the consumption
// point only has to apply `applyHookTitle` to its live title.

/** Cap matching `deriveTitle` in sessions/store.ts so hook titles stay consistent. */
export const MAX_TITLE_LENGTH = 60;

/** Parsed structured output of a hook (only the field we read is typed). */
type HookOutput = { sessionTitle?: unknown };

/**
 * Read a `sessionTitle` from a hook's already-parsed JSON output.
 *
 * Tolerant by design — a hook that doesn't set a title is the common case:
 * - non-object (null/array/string/number) → null
 * - missing or non-string `sessionTitle` → null
 * - blank (whitespace-only) → null
 * - otherwise → trimmed, collapsed-whitespace, capped to MAX_TITLE_LENGTH
 */
export function extractSessionTitle(hookOutput: unknown): string | null {
  if (typeof hookOutput !== "object" || hookOutput === null || Array.isArray(hookOutput)) return null;
  const raw = (hookOutput as HookOutput).sessionTitle;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.length > MAX_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 3)}...`
    : normalized;
}

/**
 * Resolve the session title after a hook ran: the hook's title when it provided
 * one, otherwise `currentTitle` unchanged. No sessionTitle = no change.
 */
export function applyHookTitle(currentTitle: string, hookOutput: unknown): string {
  return extractSessionTitle(hookOutput) ?? currentTitle;
}
