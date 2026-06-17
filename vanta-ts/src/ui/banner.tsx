import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { WORDMARK, TAGLINE } from "./wordmark.js";
import { FOCUS, HEALTH } from "../term/palette.js";

// The launch title screen — the VANTA block wordmark + tagline + dim metadata.
// Commits once as the first <Static> item, so it scrolls into history like a
// splash as the conversation grows. Borderless; the wordmark is the brand.

export function Banner(props: { model: string; cwd: string; kernel: string; tools: number; cmds: number }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {WORDMARK.map((line, i) => <Text key={i} bold>{line}</Text>)}
      <Box flexDirection="column" marginTop={1}>
        <Text>{TAGLINE}</Text>
        <Text><Text color={FOCUS}>{props.model}</Text> · kernel <Text color={HEALTH}>{props.kernel}</Text> · {props.tools} tools · {props.cmds} commands · <Text color={FOCUS}>/help</Text></Text>
        <Text>{props.cwd}</Text>
      </Box>
    </Box>
  );
}
