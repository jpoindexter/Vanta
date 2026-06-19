import { type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";
import { contextBar, kfmt } from "./busy.js";
import { HEALTH, FOCUS } from "../term/palette.js";
import type { EffortLevel } from "../types.js";
import type { RichSegment } from "./status-segments.js";

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

type Keys = { MODEL: string; EFFORT: string; CTX: string; ELAPSED: string; TURNS: string; QUEUED: string; MCP: string; HINT: string };

/** Pure: build the canonical text keys for each segment. */
function buildKeys(props: {
  model: string; gauge: string; bar: string;
  ctxPct: number; turns: number; queued?: number; busy: boolean; elapsed?: string; mcp?: boolean; effortLevel?: EffortLevel;
}): Keys {
  const turnsLabel = `${props.turns} turn${props.turns === 1 ? "" : "s"}`;
  return {
    MODEL:   `  ${props.model}`,
    EFFORT:  props.effortLevel && props.effortLevel !== "medium" ? `  ·  effort ${props.effortLevel}` : "",
    CTX:     `  ·  ${props.gauge} [${props.bar}] ${props.ctxPct}%`,
    ELAPSED: props.elapsed ? `  ·  ◷ ${props.elapsed}` : "",
    TURNS:   `  ·  ${turnsLabel}`,
    QUEUED:  `  ·  ${props.queued ?? 0} queued`,
    MCP:     props.mcp ? "  ·  MCP ✓" : "",
    HINT:    `  ·  ${props.busy ? "esc to interrupt" : "? shortcuts"}`,
  };
}

type RenderKeptOpts = { kept: Set<string>; k: Keys; gauge: string; bar: string; ctxPct: number; rich: RichSegment[] };

function textIf(kept: Set<string>, key: string, color: string | undefined, text: string): ReactElement | null {
  return kept.has(key) && text ? <Text>{text}</Text> : null;
}

/** The rich segments that survived the fit, rendered dim as secondary info. */
function renderRich(kept: Set<string>, rich: RichSegment[]): ReactElement[] {
  return rich
    .filter((s) => kept.has(s.text))
    .map((s) => <Text key={s.key} dimColor>{s.text}</Text>);
}

function renderKept(o: RenderKeptOpts): ReactElement {
  const { kept, k, gauge, bar, ctxPct, rich } = o;
  return (
    <Box>
      {textIf(kept, k.MODEL, undefined, k.MODEL)}
      {textIf(kept, k.EFFORT, undefined, k.EFFORT)}
      {kept.has(k.CTX) && (
        <><Text>{"  ·  "}{gauge} </Text><Text color={FOCUS}>[{bar}]</Text><Text> {ctxPct}%</Text></>
      )}
      {textIf(kept, k.ELAPSED, undefined, k.ELAPSED)}
      {textIf(kept, k.TURNS, undefined, k.TURNS)}
      {textIf(kept, k.QUEUED, undefined, k.QUEUED)}
      {textIf(kept, k.MCP, HEALTH, k.MCP)}
      {renderRich(kept, rich)}
      {textIf(kept, k.HINT, undefined, k.HINT)}
    </Box>
  );
}

export function StatusBar(props: {
  model: string;
  effortLevel?: EffortLevel;
  ctxPct: number;
  tokens: number;
  contextWindow: number;
  turns: number;
  busy: boolean;
  queued?: number;
  elapsed?: string;
  mcp?: boolean;
  /** Rich segments (rate-limit, lines delta, name, worktree, vim, custom). */
  rich?: RichSegment[];
}): ReactElement {
  const cols = (useStdout().stdout?.columns) ?? 80;
  const gauge = `${kfmt(props.tokens)}/${kfmt(props.contextWindow)}`;
  const bar   = contextBar(props.ctxPct);
  const k     = buildKeys({ ...props, gauge, bar });
  const rich  = props.rich ?? [];
  // Priority = drop order as the terminal narrows (lowest first); model + ctx
  // always survive. Rich segments (composer-assigned 2..6) compete on their own
  // priority and outrank the hint, so live status (rate-limit/delta/worktree)
  // wins terminal width over the static "? shortcuts" affordance.
  const segs: Segment[] = [
    { text: k.MODEL,  priority: 17 },
    { text: k.CTX,    priority: 16 },
    ...(k.EFFORT ? [{ text: k.EFFORT, priority: 16 }] : []),
    ...(props.elapsed ? [{ text: k.ELAPSED, priority: 15 }] : []),
    { text: k.TURNS,  priority: 14 },
    ...(props.queued && props.queued > 0 ? [{ text: k.QUEUED, priority: 13 }] : []),
    ...rich.map((s) => ({ text: s.text, priority: s.priority + 6 })),
    { text: k.HINT,   priority: 2 },
    ...(props.mcp ? [{ text: k.MCP, priority: 1 }] : []),
  ];
  const kept = new Set(fitSegments(segs, cols));
  return renderKept({ kept, k, gauge, bar, ctxPct: props.ctxPct, rich });
}
