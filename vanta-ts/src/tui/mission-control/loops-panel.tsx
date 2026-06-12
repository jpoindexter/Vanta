import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { GLYPHS } from "../figures.js";
import { resolveTheme } from "../theme.js";
import type { LoopSummary } from "./cockpit-data.js";

// The Loops tab — live standing loops from .vanta/loops. Shows each loop's
// status, iteration count, in-progress marker, and any open escalations (the
// human-clear-only blockers). Read-only mirror of the loop store.

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function statusGlyph(loop: LoopSummary): string {
  if (loop.openEscalations > 0) return GLYPHS.cross;
  if (loop.inProgress) return GLYPHS.halfRing;
  if (loop.status === "active") return GLYPHS.dot;
  return GLYPHS.bullet;
}

export function LoopsPanel(props: { loops: LoopSummary[]; width: number }): ReactElement {
  const theme = resolveTheme(process.env);
  if (props.loops.length === 0) {
    return <Text dimColor>No standing loops — use /loop to start one.</Text>;
  }
  const goalMax = Math.max(10, props.width - 28);
  return (
    <Box flexDirection="column" width={props.width}>
      {props.loops.map((loop) => {
        const blocked = loop.openEscalations > 0;
        const color = blocked ? theme.error : loop.status === "active" ? theme.marker : theme.info;
        const meta = `${loop.status} · ${loop.iterations} iter${blocked ? ` · ${loop.openEscalations}⚑` : ""}`;
        return (
          <Box key={loop.id}>
            <Text color={color}>{statusGlyph(loop)} </Text>
            <Text>{clip(loop.goal, goalMax)}</Text>
            <Text dimColor>  {meta}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
