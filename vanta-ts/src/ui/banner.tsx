import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";

// The welcome header — borderless, Claude Code v2 style: a bold title with dim
// metadata beneath it (model · kernel, capability counts, cwd). Commits once as
// the first <Static> item and scrolls into history like everything else.

export function Banner(props: { model: string; cwd: string; kernel: string; tools: number; cmds: number }): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={t.accent} bold>⏺ Vanta</Text>
        <Text dimColor={t.dimText}>  local trusted operator</Text>
      </Text>
      <Text dimColor={t.dimText}>{props.model} · kernel {props.kernel}</Text>
      <Text dimColor={t.dimText}>{props.tools} tools · {props.cmds} commands · /help for commands</Text>
      <Text dimColor={t.dimText}>{props.cwd}</Text>
    </Box>
  );
}
