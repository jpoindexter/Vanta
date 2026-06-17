import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { LoopSummary } from "../loop/summary.js";

// Read-only inline panel — lists all loops with status glyphs, scores, and
// escalation counts. Esc closes. Opened from the cockpit or /loops command.

const GOAL_MAX = 60;

function clip(s: string): string {
  return s.length > GOAL_MAX ? `${s.slice(0, GOAL_MAX - 1)}…` : s;
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
      <Text color={color}>{glyph} </Text>
      <Text>{clip(loop.goal)}</Text>
      <Text dimColor={true}>{"  "}iter {loop.iterations} · score {score}</Text>
      {loop.openEscalations > 0
        ? <Text color={"white"}>{" "}· ⚠ {loop.openEscalations} escalation{loop.openEscalations === 1 ? "" : "s"}</Text>
        : null}
    </Box>
  );
}

export function LoopsPanel(props: { loops: LoopSummary[]; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape) props.onClose(); });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={"white"} bold>Loops</Text>
      {props.loops.length === 0
        ? <Text dimColor={true}>{"  "}(no loops — design one with /loop)</Text>
        : props.loops.map((l) => <LoopRow key={l.id} loop={l} />)}
      <Text dimColor={true}>{"  "}Esc close</Text>
    </Box>
  );
}
