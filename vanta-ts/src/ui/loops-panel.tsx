import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { clipTo, termWidth } from "../term/width.js";
import type { LoopSummary } from "../loop/summary.js";

// Read-only inline panel — lists all loops with status glyphs, scores, and
// escalation counts. Esc closes. Opened from the cockpit or /loops command.

// Reserve ~40 cols for the "  iter N · score N · ⚠ N escalations" suffix; the
// goal takes the rest of the terminal instead of a fixed 60-char clip.
const SUFFIX_BUDGET = 40;

function clip(s: string): string {
  return clipTo(s, Math.max(40, termWidth() - SUFFIX_BUDGET));
}

type GlyphResult = { glyph: string; color: string };

function statusGlyph(loop: LoopSummary): GlyphResult {
  if (loop.inProgress || loop.status === "active") return { glyph: "▶", color: "white" };
  if (loop.status === "paused" || loop.openEscalations > 0) return { glyph: "⏸", color: "white" };
  if (loop.status === "done") return { glyph: "✓", color: "white" };
  return { glyph: "✗", color: "white" };
}

function LoopRow(props: { loop: LoopSummary }): ReactElement {
  const { loop } = props;
  const { glyph, color } = statusGlyph(loop);
  const score = loop.lastScore !== null ? String(loop.lastScore) : "—";
  return (
    <Box>
      <Text>{glyph} </Text>
      <Text>{clip(loop.goal)}</Text>
      <Text>{"  "}iter {loop.iterations} · score {score}</Text>
      {loop.openEscalations > 0
        ? <Text>{" "}· ⚠ {loop.openEscalations} escalation{loop.openEscalations === 1 ? "" : "s"}</Text>
        : null}
    </Box>
  );
}

export function LoopsPanel(props: { loops: LoopSummary[]; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape) props.onClose(); });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Loops</Text>
      {props.loops.length === 0
        ? <Text>{"  "}(no loops — design one with /loop)</Text>
        : props.loops.map((l) => <LoopRow key={l.id} loop={l} />)}
      <Text>{"  "}Esc close</Text>
    </Box>
  );
}
