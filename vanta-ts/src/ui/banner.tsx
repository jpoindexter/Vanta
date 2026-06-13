import { type ReactElement } from "react";
import { Box, Text } from "inkr";

// Our own banner. Super simple, one render, scrolls away into history like any
// other line (it's the first <Static> item). No ASCII art, no fullscreen card.

export function Banner(props: { model: string; cwd: string; kernel: string }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan" bold>⏺ Vanta</Text>
        <Text dimColor> — local trusted operator</Text>
      </Text>
      <Text dimColor>
        {props.model} · kernel {props.kernel} · {props.cwd}
      </Text>
      <Text dimColor>Type a message, or /help for commands.</Text>
    </Box>
  );
}
