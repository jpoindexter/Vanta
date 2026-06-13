import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme.js";

// Inline quick-help (`?` or /help). The full command list lives behind the `/`
// palette; this is the orientation card — prefixes, key chords, and where to
// look. Esc or ⏎ closes.

const ROWS: ReadonlyArray<[string, string]> = [
  ["/", "command palette — type to filter, ⏎ runs"],
  ["@path", "mention a file; its content inlines into the message"],
  ["! cmd", "run a kernel-gated shell command inline"],
  ["# note", "save a note to Vanta's brain"],
  ["↑ / ↓", "move the palette / overlay selection"],
  ["Tab", "complete the highlighted command / file"],
  ["Esc", "close an overlay · cancel an approval"],
  ["^C", "interrupt a running turn · exit when idle"],
];

export function HelpPanel(props: { onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape || key.return) props.onClose(); });
  const t = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={t.accent} bold>Shortcuts</Text>
      {ROWS.map(([k, desc]) => (
        <Box key={k}>
          <Text color={t.accent}>{`  ${k}`.padEnd(12)}</Text>
          <Text dimColor={t.dimText}>{desc}</Text>
        </Box>
      ))}
      <Text dimColor={t.dimText}>  Esc close · /help in scrollback for the full command list</Text>
    </Box>
  );
}
