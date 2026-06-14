import { type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme.js";
import type { LoopSummary } from "../loop/summary.js";

// Read-only inline panel — lists all loops with status glyphs, scores, and
// escalation counts. Esc closes. Opened from the cockpit or /loops command.

const GOAL_MAX = 60;

function clip(s: string): string {
  return s.length > GOAL_MAX ? `${s.slice(0, GOAL_MAX - 1)}…` : s;
}

type GlyphResult = { glyph: string; color: string };

function statusGlyph(loop: LoopSummary, t: ReturnType<typeof useTheme>): GlyphResult {
  if (loop.inProgress || loop.status === "active") return { glyph: "▶", color: t.success };
  if (loop.status === "paused" || loop.openEscalations > 0) return { glyph: "⏸", color: t.warning };
  if (loop.status === "done") return { glyph: "✓", color: t.success };
  return { glyph: "✗", color: t.error };
}

function LoopRow(props: { loop: LoopSummary }): ReactElement {
  const t = useTheme();
  const { loop } = props;
  const { glyph, color } = statusGlyph(loop, t);
  const score = loop.lastScore !== null ? String(loop.lastScore) : "—";
  return (
    <Box>
      <Text color={color}>{glyph} </Text>
      <Text>{clip(loop.goal)}</Text>
      <Text dimColor={t.dimText}>{"  "}iter {loop.iterations} · score {score}</Text>
      {loop.openEscalations > 0
        ? <Text color={t.warning}>{" "}· ⚠ {loop.openEscalations} escalation{loop.openEscalations === 1 ? "" : "s"}</Text>
        : null}
    </Box>
  );
}

export function LoopsPanel(props: { loops: LoopSummary[]; onClose: () => void }): ReactElement {
  useInput((_input, key) => { if (key.escape) props.onClose(); });
  const t = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={t.accent} bold>Loops</Text>
      {props.loops.length === 0
        ? <Text dimColor={t.dimText}>{"  "}(no loops — design one with /loop)</Text>
        : props.loops.map((l) => <LoopRow key={l.id} loop={l} />)}
      <Text dimColor={t.dimText}>{"  "}Esc close</Text>
    </Box>
  );
}
