import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator } from "./focus.js";
import type { OverlayRow } from "./overlays.js";

// A generic inline list overlay rendered ABOVE the composer (live region, not
// <Static>) — ↑/↓ select, ⏎ choose, Esc close. Used for sessions, skills, the
// model picker, and themes; selection runs the row's slash command.

const HINT_MAX = 52;

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
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={"white"} bold>{focusIndicator(props.focused !== false)} {props.title}</Text>
      {props.rows.length === 0
        ? <Text dimColor={true}>  (empty)</Text>
        : props.rows.map((r, i) => <Row key={r.command} row={r} active={i === clamped} />)}
      <Text dimColor={true}>  ↑/↓ select · ⏎ choose · Esc close</Text>
    </Box>
  );
}

function Row(props: { row: OverlayRow; active: boolean }): ReactElement {
  const { row, active } = props;
  const hint = row.hint && row.hint.length > HINT_MAX ? `${row.hint.slice(0, HINT_MAX - 1)}…` : row.hint;
  return (
    <Box>
      <Text color={active ? "white" : undefined}>{active ? "❯ " : "  "}</Text>
      {row.mark ? <Text color={"white"}>{row.mark} </Text> : <Text>{"  "}</Text>}
      <Text color={active ? "white" : undefined}>{row.label}</Text>
      {hint ? <Text dimColor={true}>  {hint}</Text> : null}
    </Box>
  );
}
