import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { DEFAULT_BINDINGS, formatChord } from "./keybinding/index.js";
import type { Binding } from "./keybinding/index.js";

// The keyboard-shortcut overlay. Rows are derived from the keybinding registry
// (DEFAULT_BINDINGS) so there is one source of truth — rebinding a key in
// ~/.vanta/keybindings.json changes the hint here too (via the same chords).
// Prefix shortcuts (! / #) aren't chords, so they're appended as documented
// extras.

const PREFIX_EXTRAS: ReadonlyArray<readonly [string, string]> = [
  ["! <cmd>", "run shell command inline"],
  ["# <text>", "save a note to memory"],
];

const VIM_BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ["i / a", "enter insert mode"],
  ["I / A", "insert at start / end of line"],
  ["h / l", "cursor left / right"],
  ["0 / $", "cursor to start / end"],
  ["x", "delete char at cursor"],
  ["Esc", "return to normal mode"],
];

/** Display chord(s) for a binding, joined by " / " (e.g. "↑ / ^P"). */
function chordLabel(binding: Binding): string {
  return binding.chords.map(formatChord).join(" / ");
}

const PAD = 12;

function Row({ keyLabel, desc }: { keyLabel: string; desc: string }): ReactElement {
  return (
    <Box>
      <Text color="cyan">{keyLabel.padEnd(PAD)}</Text>
      <Text dimColor>{desc}</Text>
    </Box>
  );
}

export function HelpOverlay(props: { width: number; vimEnabled?: boolean }): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={props.width}>
      <Text bold color="cyan">Key bindings</Text>
      {DEFAULT_BINDINGS.map((b) => (
        <Row key={b.action} keyLabel={chordLabel(b)} desc={b.description} />
      ))}
      {PREFIX_EXTRAS.map(([k, desc]) => (
        <Row key={k} keyLabel={k} desc={desc} />
      ))}
      {props.vimEnabled && (
        <>
          <Text bold color="cyan"> Vim normal mode</Text>
          {VIM_BINDINGS.map(([k, desc]) => (
            <Row key={k} keyLabel={k} desc={desc} />
          ))}
        </>
      )}
    </Box>
  );
}
