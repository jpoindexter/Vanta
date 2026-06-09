import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { DiffLine } from "../util/diff.js";

/** Compact inline diff view for the TUI activity feed. */
export function DiffView(props: { lines: DiffLine[] }): ReactElement {
  return (
    <Box flexDirection="column" marginLeft={2}>
      {props.lines.map((l, i) => {
        if (l.type === "add") return <Text key={i} color="green">{"+"} {l.text}</Text>;
        if (l.type === "remove") return <Text key={i} color="red">{"-"} {l.text}</Text>;
        if (l.text === "···") return <Text key={i} dimColor>  {l.text}</Text>;
        return <Text key={i} dimColor>{"  "}{l.text}</Text>;
      })}
    </Box>
  );
}
