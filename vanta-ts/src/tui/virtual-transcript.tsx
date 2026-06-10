import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { EntryRow, type Entry } from "./transcript.js";

// CC-VIRTUAL-LIST: renders only the entries that fit within the terminal viewport.
// Used in alt-screen mode only. Replaces <Static> — no scrollback, but no ghost
// frames and no Ink-tree growth. Parent passes viewOffset (how many entries above
// the bottom are hidden); this component clamps and slices.

type Props = {
  entries: Entry[];
  expanded: boolean;
  viewOffset: number;
  maxVisible: number;
};

/**
 * Virtual transcript viewport: shows a window of `maxVisible` entries ending at
 * `entries.length - viewOffset`. Shows scroll indicators when content is cut above
 * or below the visible slice.
 */
export function VirtualTranscript({ entries, expanded, viewOffset, maxVisible }: Props): ReactElement {
  const total = entries.length;
  // Clamp so we can't scroll past the oldest entry.
  const clamped = Math.min(viewOffset, Math.max(0, total - maxVisible));
  const end = total - clamped;
  const start = Math.max(0, end - maxVisible);
  const visible = entries.slice(start, end > 0 ? end : undefined);
  const above = start;
  const below = total - end;

  return (
    <Box flexDirection="column">
      {above > 0 ? (
        <Text dimColor>  ↑ {above} earlier {above === 1 ? "message" : "messages"} — pgup</Text>
      ) : null}
      {visible.map((entry, i) => (
        <EntryRow key={`v${start + i}`} entry={entry} expanded={expanded} />
      ))}
      {below > 0 ? (
        <Text dimColor>  ↓ {below} newer {below === 1 ? "message" : "messages"} — pgdn</Text>
      ) : null}
    </Box>
  );
}
