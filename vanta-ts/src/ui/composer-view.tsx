import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { focusIndicator } from "./focus.js";
import { FOCUS } from "../term/palette.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { ChannelPalette } from "./channel-palette.js";
import { matchSlash } from "./slash.js";
import { useBlink } from "./use-blink.js";
import { selEmpty, selRange, type Sel } from "./selection.js";

// Pure render layer for the composer — palettes + the bordered input line.
// Split out of composer.tsx (size gate) so the stateful Composer stays small.

/** The palettes + the input line — pure render. */
export function ComposerView(props: {
  slashMatches: ReturnType<typeof matchSlash>;
  atMatches: string[];
  channelMatches?: string[];
  sel: number;
  focused?: boolean;
  value: string;
  cursor: number;
  selection?: Sel | null;
  placeholder: string;
  pill?: { count: number; lines: number };
  ghost?: string;
  vimMode?: "normal" | "insert" | "visual";
}): ReactElement {
  const blink = useBlink();
  // The Claude-method input: a single rounded-border box (not bare ─ rules), the
  // signature shape of the reference TUI. A blinking block cursor (empty + typing)
  // is the canonical "alive/ready" cue. Stretches full-width in the column.
  return (
    <Box flexDirection="column">
      <SlashPalette matches={props.slashMatches} sel={props.sel} />
      <AtPalette files={props.atMatches} sel={props.sel} />
      <ChannelPalette channels={props.channelMatches ?? []} sel={props.sel} />
      <Box borderStyle="round" borderColor={props.focused === false ? "gray" : "white"} paddingX={1}>
        <VimTag mode={props.vimMode} />
        <Text color={FOCUS}>{focusIndicator(props.focused !== false)}</Text><Text>{" "}</Text>
        {props.value.length === 0
          ? <Text><Text inverse={blink}> </Text><Text dimColor>{props.placeholder}</Text></Text>
          : props.pill
            ? <PastedTextPill count={props.pill.count} lines={props.pill.lines} blink={blink} />
            : <CursorText value={props.value} cursor={props.cursor} selection={props.selection} blink={blink} ghost={props.ghost} />}
      </Box>
    </Box>
  );
}

/** A cheap, static vi-mode tag (no animation) shown inside the input when /vim is
 * on. NORMAL is highlighted; INSERT is dimmed so typing feels like the default. */
const VIM_TAG: Record<"normal" | "insert" | "visual", string> = { normal: "NOR", insert: "INS", visual: "VIS" };
function VimTag({ mode }: { mode?: "normal" | "insert" | "visual" }): ReactElement | null {
  if (!mode) return null;
  return <Text color={mode === "insert" ? undefined : "yellow"} dimColor={mode === "insert"}>{VIM_TAG[mode]}{" "}</Text>;
}

function PastedTextPill({ count, lines, blink }: { count: number; lines: number; blink: boolean }): ReactElement {
  return (
    <Text>
      <Text>{"["}</Text>
      <Text>Pasted text #{count} +{lines} lines</Text>
      <Text>{"]"}</Text>
      <Text inverse={blink}>{" "}</Text>
    </Text>
  );
}

/** Render the value with a blinking inverse-video block at the cursor column
 * (when `blink` is on; the bare glyph when off — that's the cursor's dark phase). */
function CursorText(props: { value: string; cursor: number; selection?: Sel | null; blink: boolean; ghost?: string }): ReactElement {
  const { value, cursor, selection, blink, ghost } = props;
  const activeSelection = selection ?? null;
  if (!selEmpty(activeSelection)) {
    const { start, end } = selRange(activeSelection);
    return (
      <Text>
        {value.slice(0, start)}<Text inverse>{value.slice(start, end)}</Text>{value.slice(end)}
      </Text>
    );
  }
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  const glyph = at === "\n" ? " " : at;
  const atEnd = cursor >= value.length;
  return (
    <Text>
      {before}<Text inverse={blink}>{glyph}</Text>{at === "\n" ? "\n" : ""}{after}
      {atEnd && ghost ? <Text dimColor>{ghost}</Text> : null}
    </Text>
  );
}
