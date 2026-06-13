import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";
import { useTheme } from "./theme.js";
import { contextBar, kfmt } from "./busy.js";

// Footer status line. Segments are dropped lowest-priority-first as the terminal
// narrows so the line never wraps. model + ctx always survive.

export type Segment = { text: string; priority: number };

/** Pure: keep highest-priority segments that fit `width`; return texts in original order. */
export function fitSegments(segments: Segment[], width: number): string[] {
  const sorted = [...segments].sort((a, b) => b.priority - a.priority);
  let kept = sorted;
  while (kept.length > 1 && kept.map((s) => s.text).join("").length > width) {
    kept = kept.slice(0, -1);
  }
  const keptSet = new Set(kept);
  return segments.filter((s) => keptSet.has(s)).map((s) => s.text);
}

type Keys = { MODEL: string; CTX: string; TURNS: string; QUEUED: string; HINT: string };

/** Pure: build the canonical text keys for each segment. */
function buildKeys(props: {
  model: string; gauge: string; bar: string;
  ctxPct: number; turns: number; queued?: number; busy: boolean;
}): Keys {
  const turnsLabel = `${props.turns} turn${props.turns === 1 ? "" : "s"}`;
  return {
    MODEL:  `  ${props.model}`,
    CTX:    `  ·  ${props.gauge} [${props.bar}] ${props.ctxPct}%`,
    TURNS:  `  ·  ${turnsLabel}`,
    QUEUED: `  ·  ${props.queued ?? 0} queued`,
    HINT:   `  ·  ${props.busy ? "esc to interrupt" : "? shortcuts"}`,
  };
}

type RenderKeptOpts = { kept: Set<string>; k: Keys; gauge: string; bar: string; ctxPct: number; t: ReturnType<typeof useTheme> };

function renderKept(o: RenderKeptOpts): ReactElement {
  const { kept, k, gauge, bar, ctxPct, t } = o;
  return (
    <Box>
      {kept.has(k.MODEL)  && <Text dimColor={t.dimText}>{k.MODEL}</Text>}
      {kept.has(k.CTX) && (
        <><Text dimColor={t.dimText}>{"  ·  "}{gauge} </Text><Text color={t.accent}>[{bar}]</Text><Text dimColor={t.dimText}> {ctxPct}%</Text></>
      )}
      {kept.has(k.TURNS)  && <Text dimColor={t.dimText}>{k.TURNS}</Text>}
      {kept.has(k.QUEUED) && <Text color={t.warning}>{k.QUEUED}</Text>}
      {kept.has(k.HINT)   && <Text dimColor={t.dimText}>{k.HINT}</Text>}
    </Box>
  );
}

export function StatusBar(props: {
  model: string;
  ctxPct: number;
  tokens: number;
  contextWindow: number;
  turns: number;
  busy: boolean;
  queued?: number;
}): ReactElement {
  const t = useTheme();
  const cols = (useStdout().stdout?.columns) ?? 80;
  const gauge = `${kfmt(props.tokens)}/${kfmt(props.contextWindow)}`;
  const bar   = contextBar(props.ctxPct);
  const k     = buildKeys({ ...props, gauge, bar });
  const segs: Segment[] = [
    { text: k.MODEL,  priority: 5 },
    { text: k.CTX,    priority: 4 },
    { text: k.TURNS,  priority: 3 },
    ...(props.queued && props.queued > 0 ? [{ text: k.QUEUED, priority: 2 }] : []),
    { text: k.HINT,   priority: 1 },
  ];
  const kept = new Set(fitSegments(segs, cols));
  return renderKept({ kept, k, gauge, bar, ctxPct: props.ctxPct, t });
}
