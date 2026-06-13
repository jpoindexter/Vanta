import { type ReactElement } from "react";
import { Box, Text } from "inkr";
import { useTheme } from "./theme.js";

// Our own banner. Super simple, one render, scrolls away into history like any
// other line (it's the first <Static> item). No ASCII art, no fullscreen card.

export function Banner(props: { model: string; cwd: string; kernel: string }): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={t.accent} bold>⏺ Vanta</Text>
        <Text dimColor={t.dimText}> — local trusted operator</Text>
      </Text>
      <Text dimColor={t.dimText}>
        {props.model} · kernel {props.kernel} · {props.cwd}
      </Text>
      <Text dimColor={t.dimText}>Type a message, or /help for commands.</Text>
    </Box>
  );
}
