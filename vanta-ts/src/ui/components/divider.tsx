import { type ReactElement } from "react";
import { Text, useStdout } from "ink";

// A horizontal rule. Spans the terminal width by default (tracks `cols`), or a
// fixed `width`. An optional centered `label` brackets a title between two runs
// of the rule glyph (e.g. ──── Section ────). Lives in the live region.

const GLYPH = "─";
const MIN_WIDTH = 4;

export function Divider(props: { width?: number; label?: string; color?: string }): ReactElement {
  const cols = useStdout().stdout?.columns ?? 80;
  const width = Math.max(MIN_WIDTH, props.width ?? cols - 1);
  const line = props.label ? labelledRule(props.label, width) : GLYPH.repeat(width);
  return <Text color={props.color} dimColor={!props.color}>{line}</Text>;
}

/** Center `label` (padded with spaces) between two runs of the rule glyph. */
function labelledRule(label: string, width: number): string {
  const text = ` ${label} `;
  if (text.length >= width) return text.slice(0, width);
  const remaining = width - text.length;
  const left = Math.floor(remaining / 2);
  return GLYPH.repeat(left) + text + GLYPH.repeat(remaining - left);
}
