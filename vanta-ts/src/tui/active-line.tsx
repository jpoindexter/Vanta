import { type ReactElement } from "react";
import { Text } from "ink";
import { formatCount } from "./status-bar.js";
import { GLYPHS } from "./figures.js";

/** Inline status line in the transcript area while the agent runs.
 * Shows the active tool verb (or "Generating") + estimated token count. */
export function ActiveLine(props: {
  busy: boolean;
  activeTool?: string;
  estTokens: number;
}): ReactElement | null {
  if (!props.busy) return null;
  const verb = props.activeTool ?? "Generating";
  return (
    <Text dimColor> {GLYPHS.ring} {verb}..  {formatCount(props.estTokens)} tokens</Text>
  );
}
