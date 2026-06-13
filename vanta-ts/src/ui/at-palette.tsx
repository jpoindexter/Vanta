import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";

// The @-mention file palette: matching repo paths above the composer while you
// type `@partial`. Lives only in the live region (not <Static>), so it vanishes
// with the line — committed history is never touched.

export function AtPalette(props: { files: string[]; sel: number }): ReactElement | null {
  const t = useTheme();
  if (props.files.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.files.map((f, i) => (
        <Box key={f}>
          <Text color={i === props.sel ? t.accent : undefined} inverse={i === props.sel}>{` @${f} `}</Text>
        </Box>
      ))}
    </Box>
  );
}
