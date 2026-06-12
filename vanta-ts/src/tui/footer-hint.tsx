import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "./figures.js";
import type { ApprovalMode } from "./approval-mode.js";

// One-line footer shown above the composer: mode symbol + label, active model,
// and a "? for shortcuts" nudge. Mirrors CC's two-line chrome with a condensed
// single line that fits above the existing round-border input box.

const MODE_SYMBOL: Record<ApprovalMode, string> = {
  review: GLYPHS.ring,
  "accept-edits": GLYPHS.halfRing,
  auto: GLYPHS.bullet,
};

const MODE_TITLE: Record<ApprovalMode, string> = {
  review: "review",
  "accept-edits": "accept-edits",
  auto: "auto",
};

export function FooterHint(props: {
  mode: ApprovalMode;
  model: string;
  accentColor: string;
  width: number;
}): ReactElement {
  const sym = MODE_SYMBOL[props.mode];
  const title = MODE_TITLE[props.mode];
  const parts = [
    `${sym} ${title}`,
    props.model,
    "? for shortcuts",
  ].join(` ${GLYPHS.mid} `);
  return (
    <Box width={props.width} paddingX={1}>
      <Text dimColor>{parts}</Text>
    </Box>
  );
}
