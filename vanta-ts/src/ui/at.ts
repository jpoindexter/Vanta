export { activeAtRef, parseAtRefs, buildContextBlock, listRepoFiles } from "../term/at-context.js";
import {
  activeChannelRef,
  formatChannelSuggestion,
  suggestChannels,
  type SlackChannel,
} from "../repl/slack-suggest.js";

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

// VANTA-SLACK-CHANNEL-SUGGEST — the composer's `#channel` path, the exact mirror of
// the `@file` one above. `slackCompletionFor` is the pure cursor→suggestions helper
// the Composer drives while you type `#partial`; `completeChannelRef` swaps the
// active `#`-token for the selected channel. Both reuse the pure slack-suggest slice
// (activeChannelRef/suggestChannels/formatChannelSuggestion) — no ranking re-done here.

const CHANNEL_LIMIT = 8;

/**
 * Suggested channels for the `#`-token under the cursor (pure). Returns `[]` when
 * the cursor isn't inside a `#`-token (so no palette opens). Mirrors how the `@`
 * path pairs `activeAtRef` + `matchAtFiles`, here `activeChannelRef` + `suggestChannels`.
 */
export function slackCompletionFor(
  buffer: string,
  cursor: number,
  channels: readonly SlackChannel[],
  limit = CHANNEL_LIMIT,
): SlackChannel[] {
  const fragment = activeChannelRef(buffer, cursor);
  if (fragment === null) return [];
  return suggestChannels(fragment, channels, limit);
}

/** The `#name` display strings for the palette (control-stripped, pure). */
export function channelSuggestionLabels(channels: readonly SlackChannel[]): string[] {
  return channels.map(formatChannelSuggestion);
}

/** Replace the active `#partial` at the cursor with the selected channel's name. */
export function completeChannelRef(line: string, cursor: number, channels: SlackChannel[], sel: number): string {
  const ch = channels[Math.min(sel, channels.length - 1)] ?? channels[0];
  if (!ch) return line;
  const before = line.slice(0, Math.min(Math.max(cursor, 0), line.length));
  const after = line.slice(before.length);
  return before.replace(/#[\w-]*$/, `#${ch.name}`) + after;
}
