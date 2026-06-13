// Pure cursor/string transforms for the composer's readline key bindings.
// No Ink/React — unit-testable in isolation (composer-edits.test.ts). A "word"
// is a run of non-whitespace; `\s` matches `\n`, so word nav stops at newlines.
// Operations act on the whole value (matching the shipped Ctrl+A/E/K convention),
// not per logical line.

const isSpace = (ch: string): boolean => /\s/.test(ch);

/** Index of the start of the word at/before `i` (skips trailing space, then word). */
export function wordLeft(value: string, i: number): number {
  let j = Math.max(0, Math.min(i, value.length));
  while (j > 0 && isSpace(value[j - 1]!)) j--;
  while (j > 0 && !isSpace(value[j - 1]!)) j--;
  return j;
}

/** Index after the word at/after `i` (skips leading space, then word). */
export function wordRight(value: string, i: number): number {
  let j = Math.max(0, Math.min(i, value.length));
  while (j < value.length && isSpace(value[j]!)) j++;
  while (j < value.length && !isSpace(value[j]!)) j++;
  return j;
}

export type Kill = { value: string; killed: string };
export type KillAt = { value: string; cursor: number; killed: string };

/** Ctrl+U — kill from start of value to the cursor. Cursor moves to 0. */
export function killToStart(value: string, i: number): KillAt {
  const c = Math.max(0, Math.min(i, value.length));
  return { value: value.slice(c), cursor: 0, killed: value.slice(0, c) };
}

/** Ctrl+K — kill from the cursor to the end of value. Cursor stays. */
export function killToEnd(value: string, i: number): Kill {
  const c = Math.max(0, Math.min(i, value.length));
  return { value: value.slice(0, c), killed: value.slice(c) };
}

/** Ctrl+W / Alt+Backspace — kill the word (and trailing space) before the cursor. */
export function killWordBack(value: string, i: number): KillAt {
  const c = Math.max(0, Math.min(i, value.length));
  const start = wordLeft(value, c);
  return { value: value.slice(0, start) + value.slice(c), cursor: start, killed: value.slice(start, c) };
}

/** Ctrl+D — delete the char under the cursor (forward delete). No-op at end / empty. */
export function deleteForward(value: string, i: number): string {
  const c = Math.max(0, Math.min(i, value.length));
  if (c >= value.length) return value;
  return value.slice(0, c) + value.slice(c + 1);
}

/** Ctrl+Y — insert killed text at the cursor. Empty text is a no-op. */
export function yank(value: string, i: number, text: string): { value: string; cursor: number } {
  const c = Math.max(0, Math.min(i, value.length));
  if (text === "") return { value, cursor: c };
  return { value: value.slice(0, c) + text + value.slice(c), cursor: c + text.length };
}
