import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";

// The welcome card — a rounded-border box that commits once into scrollback as
// the first <Static> item. Title · model+kernel · capability counts · cwd. No
// ASCII art; the border is the brand.

export function Banner(props: { model: string; cwd: string; kernel: string; tools: number; cmds: number }): ReactElement {
  const t = useTheme();
  return (
    <Box borderStyle="round" borderColor={t.border} paddingX={1} flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={t.accent} bold>⏺ Vanta</Text>
        <Text dimColor={t.dimText}> — local trusted operator</Text>
      </Text>
      <Text dimColor={t.dimText}>{props.model} · kernel {props.kernel}</Text>
      <Text dimColor={t.dimText}>{props.tools} tools · {props.cmds} commands · /help</Text>
      <Text dimColor={t.dimText}>{props.cwd}</Text>
    </Box>
  );
}
