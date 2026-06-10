import { type ReactElement, type ReactNode } from "react";
import { Box, Text } from "ink";

// Alt-screen fullscreen fill: alt-screen frame = a full viewport of blank filler ABOVE
// the content. Every frame is therefore rows+content lines tall — it ALWAYS
// overflows the viewport, so Ink always takes its clearTerminal render path
// (absolute, home-anchored full rewrite) instead of the cursor-relative
// eraseLines path. The relative path under-erases after a resize rewraps
// on-screen content, which ghost-stacks old frames (see ERRORS.md 2026-06-10).
//
// The overflow write also IS the layout: the terminal scrolls the filler off
// the top, leaving the content bottom-anchored on screen with blank rows above
// — and when the content itself outgrows the screen, its top scrolls off while
// the chrome and newest lines stay visible. Yoga cannot express either
// behavior (it clamps overflowing children to the top edge; verified — no
// negative offsets from flex-end or column-reverse).
//
// The filler carries a redraw nonce so a post-resize frame is never
// string-identical to the previous one (log-update's relative path writes
// nothing when the output string matches its last frame). It must be a
// NON-WHITESPACE glyph: Ink trims trailing spaces per line (output.js
// trimEnd), so a space toggle would not change the frame. It sits on the
// filler's first line, which always scrolls off-screen.

export function AltFrame(props: {
  rows: number;
  nonce: number;
  /** Scrollable region — rendered above the chrome, bottom-anchored by the scroll. */
  viewport: ReactNode;
  /** Bottom chrome (approval / pickers / composer + status). */
  chrome: ReactNode;
}): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box height={props.rows} flexShrink={0}>
        <Text dimColor>{props.nonce % 2 === 0 ? "" : "·"}</Text>
      </Box>
      {props.viewport}
      {props.chrome}
    </Box>
  );
}
