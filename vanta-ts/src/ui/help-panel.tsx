import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useShortcut } from "./shortcut-display.js";
import { GLOBAL_ACTIONS } from "./keybindings.js";

// Inline quick-help (`?` or /help). The full command list lives behind the `/`
// palette; this is the orientation card — prefixes, key chords, and where to
// look. Esc or ⏎ closes. Chord hints (VANTA-SHORTCUT-DISPLAY) read the LIVE
// keybinding config, so a rebind in ~/.vanta/keybindings.json shows here.

const STATIC_ROWS: ReadonlyArray<[string, string]> = [
  ["/", "command palette — type to filter, ⏎ runs"],
  ["@path", "mention a file; its content inlines into the message"],
  ["! cmd", "run a kernel-gated shell command inline"],
  ["# note", "save a note to Vanta's brain"],
  ["↑ / ↓", "move the palette / overlay selection"],
  ["Tab", "complete the highlighted command / file"],
  ["Esc", "close an overlay · cancel an approval"],
];

export function HelpPanel(props: { onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape || key.return) props.onClose(); });
  const shortcut = useShortcut();
  const rows: ReadonlyArray<[string, string]> = [
    ...STATIC_ROWS,
    [shortcut(GLOBAL_ACTIONS.exitOrAbort, "global", "^C"), "interrupt a running turn · exit when idle"],
  ];
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Shortcuts</Text>
      {rows.map(([k, desc]) => (
        <Box key={k}>
          <Text>{`  ${k}`.padEnd(12)}</Text>
          <Text>{desc}</Text>
        </Box>
      ))}
      <Text>  Esc close · /help in scrollback for the full command list</Text>
    </Box>
  );
}
