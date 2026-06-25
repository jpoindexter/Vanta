import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";

// The live streaming preview. Ink re-renders the non-<Static> region in place, which
// only works while that region fits the viewport — so we show a BOUNDED window of the
// in-flight text, not the whole growing response. But within that window we WRAP each
// line to the width (like hermes/CC) instead of clipping with "…", so streamed text
// flows and reads in full. The complete text commits to <Static> scrollback on turnEnd.

const STREAM_TAIL_LINES = 8;
const MAX_TAIL_LINES = 20; // cap so the live region never approaches the viewport (ghost-safe)

/** Word-wrap one logical line to width `w` (hard-break a word longer than w). Pure. */
function wrapLine(line: string, w: number): string[] {
  if (line.length <= w) return [line];
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= w) { cur = next; continue; }
    if (cur) { out.push(cur); cur = ""; }
    let rest = word;
    while (rest.length > w) { out.push(rest.slice(0, w)); rest = rest.slice(w); }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** The last `maxLines` WRAPPED physical lines of the in-flight text (no clipping). */
export function streamingTail(text: string, cols: number, maxLines = STREAM_TAIL_LINES): string[] {
  const w = Math.max(8, cols - 2);
  const wrapped = text.split("\n").flatMap((l) => wrapLine(l, w));
  return wrapped.slice(-maxLines);
}

/** Bounded window height: viewport rows minus chrome, clamped to [floor, cap]. */
export function tailWindow(rows: number): number {
  return Math.min(MAX_TAIL_LINES, Math.max(STREAM_TAIL_LINES, rows - 10));
}

export function StreamPreview(props: { text: string }): ReactElement {
  const out = useStdout().stdout;
  const cols = out?.columns ?? 80;
  const rows = out?.rows ?? 24;
  const lines = streamingTail(props.text, cols, tailWindow(rows));
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Text key={i}>
          <Text>{i === 0 ? "⏺ " : "  "}</Text>{l}
        </Text>
      ))}
    </Box>
  );
}
