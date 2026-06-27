import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";
import { wrapText } from "../term/wrap.js";
import { ACTIVITY } from "../term/palette.js";

// The live streaming preview. Ink re-renders the non-<Static> region in place, which
// only works while that region fits the viewport — so we show a BOUNDED window of the
// in-flight text, not the whole growing response. But within that window we WRAP each
// line to the width (like hermes/CC) instead of clipping with "…", so streamed text
// flows and reads in full. The complete text commits to <Static> scrollback on turnEnd.

const STREAM_TAIL_LINES = 8;
const MAX_TAIL_LINES = 20; // cap so the live region never approaches the viewport (ghost-safe)

/** The last `maxLines` WRAPPED physical lines of the in-flight text (no clipping).
 * Reserve 3 cells (cols−3) for the `⏺ `/`  ` marker the preview prepends — the `⏺` glyph
 * is ambiguous-width (terminal renders it wider than Ink measures), so cols−2 overflows. */
export function streamingTail(text: string, cols: number, maxLines = STREAM_TAIL_LINES): string[] {
  return wrapText(text, Math.max(8, cols - 3)).slice(-maxLines);
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

const THINK_TAIL_LINES = 6;

/** Live reasoning preview — the spinner header + a dimmed tail of the model's STREAMED thinking.
 *  Shown (in place of the generic spinner) when a reasoning model streams its reasoning: DeepSeek-R1,
 *  OpenRouter reasoning models, Anthropic thinking, or any OpenAI-compatible model that does. */
export function ThinkingPreview(props: { text: string; frame: string; secs: number }): ReactElement {
  const out = useStdout().stdout;
  const cols = out?.columns ?? 80;
  const lines = streamingTail(props.text, cols, THINK_TAIL_LINES);
  return (
    <Box flexDirection="column">
      <Text><Text color={ACTIVITY}>{props.frame}</Text> thinking… ({props.secs}s · esc to interrupt)</Text>
      {lines.map((l, i) => <Text key={i} dimColor>  {l}</Text>)}
    </Box>
  );
}
