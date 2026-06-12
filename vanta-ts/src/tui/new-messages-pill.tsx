import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "./figures.js";

// The pill shown above the composer when new output arrived while scrolled up.
// Returns null when there's nothing unseen, so callers can render it
// unconditionally.

export function NewMessagesPill(props: { count: number; accent: string; width: number }): ReactElement | null {
  if (props.count <= 0) return null;
  const label = ` ${GLYPHS.dot} ${props.count} new message${props.count === 1 ? "" : "s"} · ^end to follow `;
  return (
    <Box width={props.width} justifyContent="center">
      <Text backgroundColor={props.accent} color="black">{label}</Text>
    </Box>
  );
}
