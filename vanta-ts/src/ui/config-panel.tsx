import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { HEALTH, FOCUS } from "../term/palette.js";
import {
  configGroups, configRows, actionAt, configSummary,
  type ConfigState, type ConfigAction, type ConfigGroup, type ConfigRow,
} from "./config-view.js";

// Interactive /config settings panel (inline overlay). Lists the high-value
// settings by group; ↑/↓ move the row cursor, ⏎ toggles a boolean or cycles a
// value (model defers to the picker), Esc closes. Presentational: the parent owns
// the settings read/write and passes onAction. Dangerous raw fields
// (allowed/blockedTools, env, autoMode.rules) are intentionally never shown.

export function ConfigPanel(props: {
  state: ConfigState;
  onAction: (action: ConfigAction) => void;
  onClose: () => void;
}): ReactElement {
  const [sel, setSel] = useState(0);
  const count = configRows(props.state).length;

  useInput((_input, key) => {
    if (key.escape) return props.onClose();
    if (key.upArrow) return void setSel((s) => Math.max(0, s - 1));
    if (key.downArrow) return void setSel((s) => Math.min(Math.max(0, count - 1), s + 1));
    if (key.return) props.onAction(actionAt(props.state, sel));
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Config <Text color={FOCUS}>· {configSummary(props.state)}</Text></Text>
      <Text> </Text>
      <Groups groups={configGroups(props.state)} sel={sel} />
      <Text> </Text>
      <Text>  ↑/↓ select · ⏎ toggle/cycle · Esc close</Text>
    </Box>
  );
}

/** Render the groups as labelled sections; `sel` is a flat index across all rows. */
function Groups(props: { groups: ConfigGroup[]; sel: number }): ReactElement {
  let offset = 0;
  return (
    <Box flexDirection="column">
      {props.groups.map((group) => {
        const start = offset;
        offset += group.rows.length;
        return <Group key={group.title} group={group} start={start} sel={props.sel} />;
      })}
    </Box>
  );
}

function Group(props: { group: ConfigGroup; start: number; sel: number }): ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{props.group.title}</Text>
      {props.group.rows.map((row, i) => (
        <Row key={row.label} row={row} selected={props.start + i === props.sel} />
      ))}
    </Box>
  );
}

function Row(props: { row: ConfigRow; selected: boolean }): ReactElement {
  const { row } = props;
  const glyph = row.bool === undefined ? "  " : `${row.bool ? "●" : "○"} `;
  return (
    <Box>
      <Text>{props.selected ? "❯ " : "  "}</Text>
      <Text color={row.bool ? HEALTH : undefined}>{glyph}</Text>
      <Text>{row.label.padEnd(22)}</Text>
      <Text color={FOCUS}>{row.value}</Text>
      {row.hint ? <Text dimColor>  {row.hint}</Text> : null}
    </Box>
  );
}
