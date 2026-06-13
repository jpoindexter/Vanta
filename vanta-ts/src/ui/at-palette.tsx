import { type ReactElement } from "react";
import { Box, Text } from "inkr";

// The @-mention file palette: matching repo paths above the composer while you
// type `@partial`. Lives only in the live region (not <Static>), so it vanishes
// with the line — committed history is never touched.

export function AtPalette(props: { files: string[]; sel: number }): ReactElement | null {
  if (props.files.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.files.map((f, i) => (
        <Box key={f}>
          <Text color={i === props.sel ? "cyan" : undefined} inverse={i === props.sel}>{` @${f} `}</Text>
        </Box>
      ))}
    </Box>
  );
}
