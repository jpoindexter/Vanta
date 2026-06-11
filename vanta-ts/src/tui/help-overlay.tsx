import { type ReactElement } from "react";
import { Box, Text } from "ink";

const BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ["⏎", "submit message"],
  ["⇧⏎", "insert newline (multiline)"],
  ["↑ / ↓", "browse send history (scroll, while scrolled back)"],
  ["wheel / trackpad", "scroll the transcript"],
  ["pgup / pgdn", "scroll half a page (fn+↑/↓ on Mac)"],
  ["⇧↑ / ⇧↓", "scroll one entry"],
  ["← / →", "move cursor left / right"],
  ["Ctrl+A", "cursor to line start"],
  ["Ctrl+E", "cursor to line end"],
  ["Ctrl+U", "clear to line start"],
  ["Ctrl+K", "clear to line end"],
  ["Ctrl+W", "delete word before cursor"],
  ["Esc", "abort running turn"],
  ["⇧⇥", "cycle approval mode"],
  ["Tab", "autocomplete /command or @file"],
  ["! <cmd>", "run shell command inline"],
  ["# <text>", "save a note to memory"],
  ["? ⏎", "toggle this overlay"],
];

const VIM_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ["i / a", "enter insert mode"],
  ["I / A", "insert at start / end of line"],
  ["h / l", "cursor left / right"],
  ["0 / $", "cursor to start / end"],
  ["x", "delete char at cursor"],
  ["Esc", "return to normal mode"],
];

export function HelpOverlay(props: { width: number; vimEnabled?: boolean }): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={props.width}>
      <Text bold color="cyan">Key bindings</Text>
      {BINDINGS.map(([key, desc]) => (
        <Box key={key}>
          <Text color="cyan">{key.padEnd(22)}</Text>
          <Text dimColor>{desc}</Text>
        </Box>
      ))}
      {props.vimEnabled && (
        <>
          <Text bold color="cyan"> Vim normal mode</Text>
          {VIM_BINDINGS.map(([key, desc]) => (
            <Box key={key}>
              <Text color="cyan">{key.padEnd(22)}</Text>
              <Text dimColor>{desc}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
