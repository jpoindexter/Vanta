import type { SubagentProgress } from "../subagent/progress-store.js";
import { kfmt } from "./busy.js";

// VANTA-SPINNER-TEAMMATE — pure tree builder + focus cycle for the live area.
// When parallel sub-agents run, the spinner area renders a tree: a leader line
// (the lead agent's verb + token count) above one line per teammate (its name +
// current action/status). Idle text covers the no-running case. The leader is
// always index -1; teammates are indexed 0..n-1 in snapshot order, so the focus
// cycle is a single pure next/prev over [-1, 0 … n-1]. Process-local, no I/O.

/** The lead agent's index in the focus cycle (above the teammate rows). */
export const LEADER_INDEX = -1;

/** Text shown in the tree when a teammate has no summary yet. */
export const TEAMMATE_PENDING = "starting…";

export type TreeRowKind = "leader" | "teammate";

export type TreeRow = {
  kind: TreeRowKind;
  /** -1 for the leader, 0-based teammate index otherwise. */
  index: number;
  /** Tree-branch prefix ("" for the leader, "├ "/"└ " for teammates). */
  branch: string;
  /** Agent name/label (verb for the leader, clipped teammate title). */
  name: string;
  /** Action/status text (token count for the leader, latest summary otherwise). */
  detail: string;
  /** Whether this row is the currently focused agent. */
  selected: boolean;
};

export type LeaderState = { verb: string; tokens: number; secs: number };

const NAME_MAX = 28;
const DETAIL_MAX = 52;

function clip(s: string, max: number): string {
  const line = s.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The leader's detail: token count plus elapsed seconds. */
function leaderDetail(state: LeaderState): string {
  return `${kfmt(state.tokens)} tokens · ${state.secs}s`;
}

/** A teammate's action/status text: its latest summary, else a pending label. */
function teammateDetail(agent: SubagentProgress): string {
  return clip(agent.summary ?? TEAMMATE_PENDING, DETAIL_MAX);
}

/**
 * Build the live tree rows for the running agents. The leader row always comes
 * first (verb + tokens); each running teammate gets one row (name + action).
 * Returns an empty array when fewer than two agents run — the caller renders the
 * single-agent spinner instead, so behavior is unchanged with 0 or 1 agent.
 */
export function buildTeammateTree(
  running: SubagentProgress[],
  leader: LeaderState,
  selected: number,
): TreeRow[] {
  if (running.length < 2) return [];
  const rows: TreeRow[] = [
    { kind: "leader", index: LEADER_INDEX, branch: "", name: leader.verb, detail: leaderDetail(leader), selected: selected === LEADER_INDEX },
  ];
  running.forEach((agent, i) => {
    const last = i === running.length - 1;
    rows.push({
      kind: "teammate",
      index: i,
      branch: last ? "└ " : "├ ",
      name: clip(agent.title, NAME_MAX),
      detail: teammateDetail(agent),
      selected: selected === i,
    });
  });
  return rows;
}

/** Clamp a focus index into the valid range [LEADER_INDEX, count-1]. */
export function clampAgentIndex(index: number, count: number): number {
  if (count <= 0) return LEADER_INDEX;
  if (index < LEADER_INDEX) return count - 1;
  if (index > count - 1) return LEADER_INDEX;
  return index;
}

/** Next agent in the focus cycle (leader → first teammate → … → wrap to leader). */
export function nextAgentIndex(index: number, count: number): number {
  if (count <= 0) return LEADER_INDEX;
  return index >= count - 1 ? LEADER_INDEX : index + 1;
}

/** Previous agent in the focus cycle (wraps leader → last teammate). */
export function prevAgentIndex(index: number, count: number): number {
  if (count <= 0) return LEADER_INDEX;
  return index <= LEADER_INDEX ? count - 1 : index - 1;
}
