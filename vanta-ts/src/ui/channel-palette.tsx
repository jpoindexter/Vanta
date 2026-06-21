import { type ReactElement } from "react";
import { Box, Text } from "ink";

// VANTA-SLACK-CHANNEL-SUGGEST — the `#channel` palette, the exact mirror of
// at-palette.tsx. Renders the ranked `#name` suggestions above the composer while
// you type `#partial`. Lives only in the live region (not <Static>), so it vanishes
// with the line — committed history is never touched. The label strings arrive
// already control-stripped (formatChannelSuggestion), so a crafted Slack channel
// name can't inject a terminal escape here.

export function ChannelPalette(props: { channels: string[]; sel: number }): ReactElement | null {
  if (props.channels.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.channels.map((c, i) => (
        <Box key={c}>
          <Text inverse={i === props.sel}>{` ${c} `}</Text>
        </Box>
      ))}
    </Box>
  );
}
