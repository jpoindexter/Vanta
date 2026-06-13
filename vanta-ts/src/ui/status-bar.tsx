import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";
import { contextBar, kfmt } from "./busy.js";

// The footer status line — model · a context gauge (used/window + bar + %) · turns
// · queued, with an esc-to-interrupt / shortcuts hint. Reads the live provider so
// it reflects a /model swap even though the banner already scrolled away.

export function StatusBar(props: {
  model: string;
  ctxPct: number;
  tokens: number;
  contextWindow: number;
  turns: number;
  busy: boolean;
  queued?: number;
}): ReactElement {
  const t = useTheme();
  const gauge = `${kfmt(props.tokens)}/${kfmt(props.contextWindow)}`;
  return (
    <Box>
      <Text dimColor={t.dimText}>  {props.model}  ·  {gauge} </Text>
      <Text color={t.accent}>[{contextBar(props.ctxPct)}]</Text>
      <Text dimColor={t.dimText}> {props.ctxPct}%  ·  {props.turns} turn{props.turns === 1 ? "" : "s"}</Text>
      {props.queued && props.queued > 0 ? <Text color={t.warning}>  ·  {props.queued} queued</Text> : null}
      {props.busy ? <Text dimColor={t.dimText}>  ·  esc to interrupt</Text> : <Text dimColor={t.dimText}>  ·  ? shortcuts</Text>}
    </Box>
  );
}
