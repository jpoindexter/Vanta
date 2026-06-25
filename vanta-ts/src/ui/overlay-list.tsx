import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator } from "./focus.js";
import { planColumns, clipTo, termWidth } from "../term/width.js";
import type { OverlayRow } from "./overlays.js";

// A generic inline list overlay rendered ABOVE the composer (live region, not
// <Static>) — ↑/↓ select, ⏎ choose, Esc close. Used for sessions, skills, the
// model picker, and themes; selection runs the row's slash command.
//
// WIDTH-RESPONSIVE (planColumns): labels align into one column and hints fill the
// rest of the terminal — no fixed 52-char clip (dec-cognitive-load). Hints are
// dimmed so the label is the scannable anchor (dec-krug); the active row's label
// is the inverse outlier (dec-ux-laws / Von Restorff). The -4 budgets the
// "❯ ⟨mark⟩ " row prefix so a hint never wraps off the edge.

const PREFIX = 4; // "❯ " + mark/spacer columns before the label

export function OverlayList(props: {
  title: string;
  rows: OverlayRow[];
  focused?: boolean;
  onSelect: (row: OverlayRow) => void;
  onClose: () => void;
}): ReactElement {
  const [sel, setSel] = useState(0);
  const clamped = Math.min(sel, Math.max(0, props.rows.length - 1));
  useInput((_input, key) => {
    if (key.escape) return void props.onClose();
    if (key.upArrow) return void setSel(Math.max(0, clamped - 1));
    if (key.downArrow) return void setSel(Math.min(props.rows.length - 1, clamped + 1));
    if (key.return) { const r = props.rows[clamped]; if (r) props.onSelect(r); }
  });
  const cols = planColumns(props.rows.map((r) => r.label), { width: termWidth() - PREFIX, nameCap: 34 });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{focusIndicator(props.focused !== false)} {props.title}</Text>
      {props.rows.length === 0
        ? <Text>  (empty)</Text>
        : props.rows.map((r, i) => <Row key={r.command} row={r} active={i === clamped} nameCol={cols.nameCol} descW={cols.descW} />)}
      <Text dimColor>  ↑/↓ select · ⏎ choose · Esc close</Text>
    </Box>
  );
}

function Row(props: { row: OverlayRow; active: boolean; nameCol: number; descW: number }): ReactElement {
  const { row, active, nameCol, descW } = props;
  return (
    <Box>
      <Text>{active ? "❯ " : "  "}</Text>
      {row.mark ? <Text>{row.mark} </Text> : <Text>{"  "}</Text>}
      <Text inverse={active}>{row.label.padEnd(nameCol)}</Text>
      {row.hint ? <Text dimColor> {clipTo(row.hint, descW)}</Text> : null}
    </Box>
  );
}
