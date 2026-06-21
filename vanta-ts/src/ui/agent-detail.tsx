import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { FOCUS, HEALTH, ACTIVITY, RISK } from "../term/palette.js";

// Agent management views (PURE RENDER — props in → frame out, no I/O).
//   AgentsList   — a roster of agents (name + status), the selected row marked.
//   AgentDetail  — one agent's detail (name, model, tools summary, status, color).
// Both are render-only; no useInput/useEffect/useState. The LIVE agent data (the
// custom-agent defs from subagent/agent-defs.ts + the running agents from
// team/tasks.ts) is the documented boundary — NAMED below, not wired this round.
//
// WIRE-UP (mirrors how mcp-panel.tsx is mounted from ui/app.tsx as an overlay):
//   ui/app.tsx (or a `/agents` overlay in repl/operator-cmds.ts) would build the
//   roster from `listAgentDefs(deps)` (custom CustomAgentDef defs) merged with the
//   running tasks from `readTasks(env)`/`latestTasks(...)` (team/tasks.ts), pass
//   them as AgentsList({agents, selectedIndex}), and on ⏎ resolve the selected
//   def → AgentDetail({agent}) — exactly as McpPanel drills server → tool detail.
//
// SECURITY: name/model/tool strings may be operator-authored. Ink's <Text>
// already escapes control bytes for layout; `stripControl` additionally removes
// raw control/ANSI sequences so an authored value can't inject terminal codes.

/** A row in the agent roster: a display name + a coarse status. */
export type AgentRow = {
  readonly name: string;
  readonly status?: AgentStatus;
};

/** Full detail for one agent (the AgentDetail props shape). */
export type AgentDetailData = {
  readonly name: string;
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly status?: AgentStatus;
  /** Optional accent color for the marker (an Ink color name / hex). */
  readonly color?: string;
};

/** Coarse agent status; drives the status accent color. */
export type AgentStatus = "idle" | "running" | "blocked" | "done";

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: HEALTH,
  running: ACTIVITY,
  blocked: RISK,
  done: HEALTH,
};

const MAX_TOOLS_SHOWN = 3;

/** Strip raw control/ANSI bytes from an operator-authored string (defense in
 *  depth; Ink already escapes for layout). Keeps printable text only. */
function stripControl(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/[\x00-\x1f\x7f]/g, "");
}

/** Accent color for a status (terminal default when status is absent). */
function statusColor(status?: AgentStatus): string | undefined {
  return status ? STATUS_COLOR[status] : undefined;
}

/**
 * Summarize a tool allowlist for display (PURE). Mirrors the agent-defs contract:
 *   undefined → "all tools" (unrestricted — the general-purpose default)
 *   []        → "no tools"
 *   [a,b,c,d] → "4 tools: a, b, c, …" (first {@link MAX_TOOLS_SHOWN} named).
 * Names are control-stripped (operator-authored) before joining.
 */
export function formatToolsSummary(tools?: readonly string[]): string {
  if (tools === undefined) return "all tools";
  if (tools.length === 0) return "no tools";
  const clean = tools.map((t) => stripControl(t.trim())).filter((t) => t.length > 0);
  if (clean.length === 0) return "no tools";
  const shown = clean.slice(0, MAX_TOOLS_SHOWN).join(", ");
  const noun = clean.length === 1 ? "tool" : "tools";
  const ellipsis = clean.length > MAX_TOOLS_SHOWN ? ", …" : "";
  return `${clean.length} ${noun}: ${shown}${ellipsis}`;
}

/** One roster row — selected row prefixed with the ❯ marker (accessibility:
 *  the selection is both a glyph and a color, never color alone). */
function AgentListRow(props: { agent: AgentRow; selected: boolean }): ReactElement {
  const { agent, selected } = props;
  const name = stripControl(agent.name) || "(unnamed)";
  return (
    <Box>
      <Text color={selected ? FOCUS : undefined}>{selected ? "❯ " : "  "}</Text>
      <Text bold={selected}>{name}</Text>
      {agent.status ? <Text color={statusColor(agent.status)}>  {agent.status}</Text> : null}
    </Box>
  );
}

/**
 * AgentsList — the agent roster (PURE RENDER). Each agent shows its name + status;
 * the row at `selectedIndex` is marked with ❯. An empty roster renders a clean
 * "no agents" row. `selectedIndex` out of range simply marks no row.
 */
export function AgentsList(props: {
  agents: readonly AgentRow[];
  selectedIndex?: number;
}): ReactElement {
  const { agents } = props;
  const sel = props.selectedIndex ?? 0;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Agents ({agents.length})</Text>
      {agents.length === 0 ? (
        <Text dimColor>  no agents</Text>
      ) : (
        agents.map((agent, i) => (
          <AgentListRow key={`${agent.name}-${i}`} agent={agent} selected={i === sel} />
        ))
      )}
    </Box>
  );
}

/** A labeled "Field  value" detail row (value control-stripped, label dim). */
function DetailRow(props: { label: string; value: string; color?: string }): ReactElement {
  return (
    <Box>
      <Text dimColor>{props.label.padEnd(7)}</Text>
      <Text color={props.color}>{stripControl(props.value)}</Text>
    </Box>
  );
}

/**
 * AgentDetail — one agent's detail view (PURE RENDER). Shows the name (marker
 * tinted by `color` if set), model (or "inherit" when absent), the tools summary
 * (via {@link formatToolsSummary}), and status. No I/O, no input handling.
 */
export function AgentDetail(props: { agent: AgentDetailData }): ReactElement {
  const { agent } = props;
  const name = stripControl(agent.name) || "(unnamed)";
  const marker = agent.color ? stripControl(agent.color) : FOCUS;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={marker}>● </Text>
        <Text bold>{name}</Text>
      </Box>
      <Text> </Text>
      <DetailRow label="Model" value={agent.model ? agent.model : "inherit"} />
      <DetailRow label="Tools" value={formatToolsSummary(agent.tools)} />
      <DetailRow label="Status" value={agent.status ?? "idle"} color={statusColor(agent.status ?? "idle")} />
    </Box>
  );
}
