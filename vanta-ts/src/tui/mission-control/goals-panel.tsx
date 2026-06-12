import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "../figures.js";
import { resolveTheme } from "../theme.js";
import type { Goal } from "../../types.js";

// The Goals tab — the kernel's live goal ledger (GET /api/goals). Active goals
// carry the recording dot; completed goals show a check. Read-only mirror.

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function GoalsPanel(props: { goals: Goal[]; width: number }): ReactElement {
  const theme = resolveTheme(process.env);
  if (props.goals.length === 0) {
    return <Text dimColor>No goals yet — use /goal &lt;text&gt; to set one.</Text>;
  }
  const labelMax = Math.max(10, props.width - 6);
  return (
    <Box flexDirection="column" width={props.width}>
      {props.goals.map((g) => {
        const done = g.status === "done";
        return (
          <Box key={g.id}>
            <Text color={done ? theme.success : theme.marker}>{done ? GLYPHS.check : GLYPHS.dot} </Text>
            <Text dimColor={done}>{clip(g.text, labelMax)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
