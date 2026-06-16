import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.js";
import { focusIndicator } from "./focus.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { matchSlash } from "./slash.js";
import { useBlink } from "./use-blink.js";

// Pure render layer for the composer — palettes + the bordered input line.
// Split out of composer.tsx (size gate) so the stateful Composer stays small.

/** The palettes + the input line — pure render. */
export function ComposerView(props: {
  slashMatches: ReturnType<typeof matchSlash>;
  atMatches: string[];
  sel: number;
  focused?: boolean;
  value: string;
  cursor: number;
  placeholder: string;
  pill?: { count: number; lines: number };
}): ReactElement {
  const t = useTheme();
  const blink = useBlink();
  // The Claude-method input: a single rounded-border box (not bare ─ rules), the
  // signature shape of the reference TUI. A blinking block cursor (empty + typing)
  // is the canonical "alive/ready" cue. Stretches full-width in the column.
  return (
    <Box flexDirection="column">
      <SlashPalette matches={props.slashMatches} sel={props.sel} />
      <AtPalette files={props.atMatches} sel={props.sel} />
      <Box borderStyle="round" borderColor={props.focused === false ? t.border : t.accent} paddingX={1}>
        <Text color={t.accent}>{focusIndicator(props.focused !== false)}{" "}</Text>
        {props.value.length === 0
          ? <Text><Text inverse={blink}> </Text><Text dimColor={t.dimText}>{props.placeholder}</Text></Text>
          : props.pill
            ? <PastedTextPill count={props.pill.count} lines={props.pill.lines} blink={blink} />
            : <CursorText value={props.value} cursor={props.cursor} blink={blink} />}
      </Box>
    </Box>
  );
}

function PastedTextPill({ count, lines, blink }: { count: number; lines: number; blink: boolean }): ReactElement {
  return (
    <Text>
      <Text dimColor>{"["}</Text>
      <Text>Pasted text #{count} +{lines} lines</Text>
      <Text dimColor>{"]"}</Text>
      <Text inverse={blink}>{" "}</Text>
    </Text>
  );
}

/** Render the value with a blinking inverse-video block at the cursor column
 * (when `blink` is on; the bare glyph when off — that's the cursor's dark phase). */
function CursorText(props: { value: string; cursor: number; blink: boolean }): ReactElement {
  const { value, cursor, blink } = props;
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  const glyph = at === "\n" ? " " : at;
  return (
    <Text>
      {before}<Text inverse={blink}>{glyph}</Text>{at === "\n" ? "\n" : ""}{after}
    </Text>
  );
}
