import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";

// The live streaming preview. CRITICAL: Ink re-renders the non-<Static> region in
// place, which only works while that region fits the viewport. So we never render
// the whole growing response live — only a short clipped TAIL. The complete text
// commits to <Static> scrollback intact on turnEnd; this is just the ticker.

const STREAM_TAIL_LINES = 6;

/** Last N lines of the in-flight text, each clipped to the terminal width (no
 * wrapping → bounded height → Ink's in-place redraw can't stack/ghost). */
export function streamingTail(text: string, cols: number, maxLines = STREAM_TAIL_LINES): string[] {
  const w = Math.max(8, cols - 2);
  const tail = text.split("\n").slice(-maxLines);
  return tail.map((l) => (l.length > w ? `${l.slice(0, w - 1)}…` : l));
}

export function StreamPreview(props: { text: string }): ReactElement {
  const cols = useStdout().stdout?.columns ?? 80;
  const lines = streamingTail(props.text, cols);
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
