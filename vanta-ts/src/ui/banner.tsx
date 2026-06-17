import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { WORDMARK, TAGLINE } from "./wordmark.js";

// The launch title screen — the VANTA block wordmark + tagline + dim metadata.
// Commits once as the first <Static> item, so it scrolls into history like a
// splash as the conversation grows. Borderless; the wordmark is the brand.

export function Banner(props: { model: string; cwd: string; kernel: string; tools: number; cmds: number }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {WORDMARK.map((line, i) => <Text key={i} color={"white"} bold>{line}</Text>)}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor={true}>{TAGLINE}</Text>
        <Text dimColor={true}>{props.model} · kernel {props.kernel} · {props.tools} tools · {props.cmds} commands · /help</Text>
        <Text dimColor={true}>{props.cwd}</Text>
      </Box>
    </Box>
  );
}
