import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { StatusBar } from "./status-bar.js";
import { StreamPreview } from "./stream-view.js";
import { busyLabel } from "./busy.js";
import { toolLoaderRows } from "./tool-loader.js";
import { buildTeammateTree, type LeaderState, type TreeRow } from "./teammate-tree.js";
import { FOCUS, ACTIVITY, GOAL } from "../term/palette.js";
import type { PendingTool, Entry } from "./types.js";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import type { SubagentProgress } from "../subagent/progress-store.js";
import type { EffortLevel } from "../types.js";
import type { RichSegment } from "./status-segments.js";

function goalClip(s: string): string {
  const l = s.split("\n")[0] ?? "";
  return l.length > 88 ? `${l.slice(0, 87)}…` : l;
}

/** Pure: the freshest running sub-agent's pill text (its summary, else its
 * clipped title), with a `+N` suffix when more workers are running. */
export function agentPillText(running: SubagentProgress[]): string | null {
  const top = running[0];
  if (!top) return null;
  const label = top.summary ?? goalClip(top.title);
  const more = running.length - 1;
  return more > 0 ? `${label} (+${more})` : label;
}

/** The footer pill for a running sub-agent's live progress summary. */
export function AgentPill(props: { running: SubagentProgress[] }): ReactElement | null {
  const text = agentPillText(props.running);
  if (!text) return null;
  return <Text><Text color={ACTIVITY}>⛁</Text> {text}</Text>;
}

export function Footer(props: {
  model: string;
  effortLevel: EffortLevel;
  ctxPct: number;
  tokens: number;
  contextWindow: number;
  turns: number;
  busy: boolean;
  queued: number;
  goal: string | null | undefined;
  mcp: boolean;
  elapsed: string;
  agents?: SubagentProgress[];
  rich?: RichSegment[];
}): ReactElement {
  return (
    <Box flexDirection="column">
      <AgentPill running={props.agents ?? []} />
      <Text>{props.goal ? <><Text color={GOAL}>◇</Text> {goalClip(props.goal)}</> : " "}</Text>
      <StatusBar model={props.model} effortLevel={props.effortLevel} ctxPct={props.ctxPct} tokens={props.tokens} contextWindow={props.contextWindow} turns={props.turns} busy={props.busy} queued={props.queued} elapsed={props.elapsed} mcp={props.mcp} rich={props.rich} />
      <Text>  <Text color={FOCUS}>/</Text> commands  ·  <Text color={FOCUS}>@</Text> files  ·  <Text color={ACTIVITY}>!</Text> shell  ·  <Text color={GOAL}>#</Text> memory</Text>
    </Box>
  );
}

/** A single tree row: the focused row shows a ❯ pointer; the leader row carries
 * the animated spinner frame, teammate rows their branch glyph. */
function TreeRowView(props: { row: TreeRow; frame: string }): ReactElement {
  const { row, frame } = props;
  const marker = row.kind === "leader" ? frame : row.branch;
  const color = row.kind === "leader" ? ACTIVITY : FOCUS;
  return (
    <Text>
      {row.selected ? <Text color={FOCUS}>❯ </Text> : "  "}
      <Text color={color}>{marker}</Text> {row.name} <Text dimColor>{row.detail}</Text>
    </Text>
  );
}

/** The live tree of all running agents: a leader line (verb + tokens) above one
 * line per teammate (name + current action). Renders nothing for <2 agents — the
 * caller falls back to the single-agent spinner, so behavior is unchanged then. */
export function TeammateTree(props: { agents: SubagentProgress[]; leader: LeaderState; selected: number; frame: string }): ReactElement | null {
  const rows = buildTeammateTree(props.agents, props.leader, props.selected);
  if (rows.length === 0) return null;
  return (
    <Box flexDirection="column">
      {rows.map((row) => <TreeRowView key={row.kind === "leader" ? "leader" : `t${row.index}`} row={row} frame={props.frame} />)}
      <Text dimColor>  shift+←/→ to switch focus · esc to interrupt</Text>
    </Box>
  );
}

export function LiveRegion(props: { streaming: string; activeTools: PendingTool[]; busy: boolean; tick: number; agents?: SubagentProgress[]; selectedAgent?: number; leaderTokens?: number }): ReactElement | null {
  const { streaming, activeTools, busy, tick, agents = [], selectedAgent = -1, leaderTokens = 0 } = props;
  if (!busy && !streaming) return null;
  const loaders = toolLoaderRows(activeTools, tick);
  const { frame, verb } = busyLabel(tick);
  const secs = Math.round(tick * 0.15);
  const tree = busy && agents.length >= 2
    ? <TeammateTree agents={agents} leader={{ verb, tokens: leaderTokens, secs }} selected={selectedAgent} frame={frame} />
    : null;
  return (
    <Box flexDirection="column">
      {streaming ? <StreamPreview text={streaming} /> : null}
      {/* Per-tool loaders: each in-flight tool animates its own row (parallel-safe),
          transitioning into its ⏺ Verb(detail) result once it completes. */}
      {loaders.map((r) => (
        <Text key={r.key}><Text color={FOCUS}>{r.frame}</Text> {r.label}…</Text>
      ))}
      {/* Parallel agents → a live tree (leader + one row per teammate). One/zero
          agents → the single thinking spinner, shown when no tool is running. */}
      {tree}
      {busy && !streaming && loaders.length === 0 && !tree
        ? <Text><Text color={ACTIVITY}>{frame}</Text> {verb}… ({secs}s · esc to interrupt)</Text>
        : null}
    </Box>
  );
}

export function buildStaticItems(
  model: string,
  repoRoot: string,
  entries: Entry[],
  caps: { tools: number; cmds: number },
): Array<{ key: string; node: ReactElement }> {
  return [
    { key: "banner", node: <Banner model={model} cwd={repoRoot} kernel="127.0.0.1:7788" tools={caps.tools} cmds={caps.cmds} /> },
    ...entries.map((e, i) => ({ key: `e${i}`, node: <EntryView entry={e} /> })),
  ];
}
