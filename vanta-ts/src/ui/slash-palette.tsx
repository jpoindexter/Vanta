import { type ReactElement } from "react";
import { Box, Text } from "ink";
import type { SlashMatch } from "./slash.js";
import { planColumns, clipTo } from "../term/width.js";

// The inline command palette: a small list above the composer while you type a
// slash command. Committed history is untouched (it's not a <Static> item) —
// this lives only in the live region and disappears when the line clears.
//
// Layout is WIDTH-RESPONSIVE via planColumns (dec-cognitive-load: no arbitrary
// truncation = extraneous load). The description is dimmed so the command name is
// the scannable anchor (dec-krug), and the selected row is the inverse outlier
// (dec-ux-laws / Von Restorff).

export function SlashPalette(props: { matches: SlashMatch[]; sel: number }): ReactElement | null {
  const { matches, sel } = props;
  if (matches.length === 0) return null;
  const labels = matches.map((m) => `/${m.name}${m.arg ? ` ${m.arg}` : ""}`);
  const { nameCol, descW } = planColumns(labels, { nameCap: 30 });
  return (
    <Box flexDirection="column" marginBottom={1}>
      {matches.map((m, i) => (
        <PaletteRow key={m.name} label={labels[i]!} desc={m.desc} nameCol={nameCol} descW={descW} active={i === sel} />
      ))}
    </Box>
  );
}

function PaletteRow(props: { label: string; desc: string; nameCol: number; descW: number; active: boolean }): ReactElement {
  const { label, desc, nameCol, descW, active } = props;
  return (
    <Box>
      <Text inverse={active}>{label.padEnd(nameCol)}</Text>
      <Text dimColor> {clipTo(desc, descW)}</Text>
    </Box>
  );
}
