import { type ReactElement } from "react";
import { Box, Text } from "ink";

// Queued submissions stay visible above the composer while a turn is running.
// Keep this live region bounded so long prompts cannot push the composer off
// screen or cause terminal ghosting.
const MAX_ROWS = 3;
const ROW_WIDTH = 88;

export function queueRowText(text: string): string {
  const first = text.split("\n")[0] ?? "";
  const trimmed = first.trim();
  return trimmed.length <= ROW_WIDTH ? trimmed : `${trimmed.slice(0, ROW_WIDTH - 1)}…`;
}

export function visibleQueue(queued: readonly string[]): string[] {
  return queued.slice(0, MAX_ROWS).map(queueRowText);
}

export function QueuePanel(props: { queued: readonly string[] }): ReactElement | null {
  if (props.queued.length === 0) return null;
  const rows = visibleQueue(props.queued);
  const extra = props.queued.length - rows.length;
  return (
    <Box flexDirection="column" marginTop={1}>
      {rows.map((row, index) => (
        <Box key={`${index}:${row}`}>
          <Text backgroundColor="#3a3a3a" color="white">{`  ❯ ${row}`}</Text>
        </Box>
      ))}
      {extra > 0 ? <Text dimColor>{`    … ${extra} more queued`}</Text> : null}
      <Text dimColor>{"    Press ↑ to edit queued messages"}</Text>
    </Box>
  );
}
