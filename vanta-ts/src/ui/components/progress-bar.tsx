import { type ReactElement } from "react";
import { Box, Text } from "ink";

// A bounded progress bar: [████░░░░] with an optional percent label. `value` and
// `max` are clamped so a caller can never overflow or underflow the track. Pure
// fill computation lives in `barCells` so the half-filled etc. cases are exact.

const BLOCK_GLYPHS = { filled: "█", empty: "░" } as const;
const SQUARE_GLYPHS = { filled: "■", empty: "□" } as const;
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
  /** Square cells are visually discrete and avoid the slanted/striped look. */
  variant?: "blocks" | "squares";
  /** The compacting meter uses a bare track; existing bars remain bracketed. */
  bracketed?: boolean;
}): ReactElement {
  const max = props.max ?? 1;
  const width = props.width ?? DEFAULT_WIDTH;
  const filled = barCells(props.value, max, width);
  const pct = Math.round(Math.max(0, Math.min(1, max <= 0 ? 0 : props.value / max)) * 100);
  const glyphs = props.variant === "squares" ? SQUARE_GLYPHS : BLOCK_GLYPHS;
  const bracketed = props.bracketed ?? true;
  return (
    <Box>
      {bracketed ? <Text dimColor>[</Text> : null}
      <Text color={props.color}>{glyphs.filled.repeat(filled)}</Text>
      <Text dimColor>{glyphs.empty.repeat(width - filled)}</Text>
      {bracketed ? <Text dimColor>]</Text> : null}
      {props.showPercent ? <Text> {pct}%</Text> : null}
    </Box>
  );
}
