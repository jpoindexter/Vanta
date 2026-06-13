export { activeAtRef, parseAtRefs, buildContextBlock, listRepoFiles } from "../tui/at-context.js";

// @-file mention helpers for the v2 composer. Reuses the proven at-context
// parser/loader (parseAtRefs/buildContextBlock inline the referenced file
// content at send time); adds the completion-palette filtering the composer
// drives while you type `@partial`.

const AT_LIMIT = 8;

/** Repo files matching the partial after the last `@`, capped for the palette. */
export function matchAtFiles(files: string[], partial: string, limit = AT_LIMIT): string[] {
  if (!partial) return files.slice(0, limit);
  const p = partial.toLowerCase();
  return files.filter((f) => f.toLowerCase().includes(p)).slice(0, limit);
}

/** Replace the active `@partial` at the end of the line with the selected file. */
export function completeAtRef(line: string, files: string[], sel: number): string {
  const f = files[Math.min(sel, files.length - 1)] ?? files[0];
  return f ? line.replace(/@[\w./\-]*$/, `@${f}`) : line;
}
