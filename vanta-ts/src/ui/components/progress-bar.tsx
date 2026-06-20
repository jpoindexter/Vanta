import { type ReactElement } from "react";
import { Box, Text } from "ink";

// A bounded progress bar: [████░░░░] with an optional percent label. `value` and
// `max` are clamped so a caller can never overflow or underflow the track. Pure
// fill computation lives in `barCells` so the half-filled etc. cases are exact.

const FILLED = "█";
const EMPTY = "░";
const DEFAULT_WIDTH = 20;

/** Pure: how many of `width` cells are filled for `value/max` (clamped 0..width). */
export function barCells(value: number, max: number, width: number): number {
  if (max <= 0 || width <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, value / max));
  return Math.round(ratio * width);
}

export function ProgressBar(props: {
  value: number;
  max?: number;
  width?: number;
  color?: string;
  showPercent?: boolean;
}): ReactElement {
  const max = props.max ?? 1;
  const width = props.width ?? DEFAULT_WIDTH;
  const filled = barCells(props.value, max, width);
  const pct = Math.round(Math.max(0, Math.min(1, max <= 0 ? 0 : props.value / max)) * 100);
  return (
    <Box>
      <Text dimColor>[</Text>
      <Text color={props.color}>{FILLED.repeat(filled)}</Text>
      <Text dimColor>{EMPTY.repeat(width - filled)}</Text>
      <Text dimColor>]</Text>
      {props.showPercent ? <Text> {pct}%</Text> : null}
    </Box>
  );
}
