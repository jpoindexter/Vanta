import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "../../term/figures.js";

// An attribution line: a marker glyph + an author, optionally followed by dim
// secondary parts (timestamp, source) separated by the mid-dot. One row, e.g.
//   ⏺ vanta · 2m ago · semantic
// The author stays terminal-default; the rest is dim secondary info.

export function Byline(props: {
  author: string;
  marker?: string;
  color?: string;
  parts?: string[];
}): ReactElement {
  const marker = props.marker ?? GLYPHS.dot;
  const parts = (props.parts ?? []).filter(Boolean);
  return (
    <Box>
      <Text color={props.color}>{marker} </Text>
      <Text>{props.author}</Text>
      {parts.map((p, i) => (
        <Text key={i} dimColor>{`  ${GLYPHS.mid}  ${p}`}</Text>
      ))}
    </Box>
  );
}
