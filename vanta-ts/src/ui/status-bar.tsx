import { type ReactElement } from "react";
import { Box, Text } from "inkr";

// The footer: one dim line under the composer — model · context fill · turns ·
// mode, plus an esc-to-interrupt hint while a turn runs. Reads the live provider
// (so it reflects a /model swap even though the banner already scrolled away).

export function StatusBar(props: {
  model: string;
  ctxPct: number;
  turns: number;
  busy: boolean;
  queued?: number;
  mode?: string;
}): ReactElement {
  const parts = [
    props.model,
    `ctx ${props.ctxPct}%`,
    `${props.turns} turn${props.turns === 1 ? "" : "s"}`,
  ];
  if (props.queued && props.queued > 0) parts.push(`${props.queued} queued`);
  if (props.mode) parts.push(props.mode);
  return (
    <Box>
      <Text dimColor>{parts.join("  ·  ")}</Text>
      {props.busy ? <Text dimColor>  ·  esc to interrupt</Text> : <Text dimColor>  ·  ? shortcuts</Text>}
    </Box>
  );
}
