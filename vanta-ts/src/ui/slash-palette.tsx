import { type ReactElement } from "react";
import { Box, Text } from "inkr";
import { useTheme } from "./theme.js";
import type { SlashMatch } from "./slash.js";

// The inline command palette: a small list above the composer while you type a
// slash command. Committed history is untouched (it's not a <Static> item) —
// this lives only in the live region and disappears when the line clears.

const NAME_COL = 22;
const DESC_MAX = 48;

export function SlashPalette(props: { matches: SlashMatch[]; sel: number }): ReactElement | null {
  if (props.matches.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.matches.map((m, i) => (
        <PaletteRow key={m.name} match={m} active={i === props.sel} />
      ))}
    </Box>
  );
}

function PaletteRow(props: { match: SlashMatch; active: boolean }): ReactElement {
  const { match, active } = props;
  const t = useTheme();
  const label = `/${match.name}${match.arg ? ` ${match.arg}` : ""}`;
  const desc = match.desc.length > DESC_MAX ? `${match.desc.slice(0, DESC_MAX - 1)}…` : match.desc;
  return (
    <Box>
      <Text color={active ? t.accent : undefined} inverse={active}>{label.padEnd(NAME_COL)}</Text>
      <Text dimColor={t.dimText}> {desc}</Text>
    </Box>
  );
}
