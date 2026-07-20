import { readdir } from "node:fs/promises";
import type { GraphRunState } from "./run-state.js";
import { loadGraphRunState } from "./run-state-store.js";

export type ReplayEvent = {
  at: string;
  kind: "model_call" | "side_effect" | "decision" | "approval" | "state_diff" | "topology" | "control" | "stop";
  label: string;
  nodeId?: string;
  replay: "recorded" | "never_by_default" | "not_replayed";
};

export type GraphReplayPacket = {
  runId: string;
  graphId: string;
  status: GraphRunState["status"];
  revision: number;
  updatedAt: string;
  nodes: Array<{ id: string; type: string; status: string; attempts: number }>;
  timeline: ReplayEvent[];
  artifacts: GraphRunState["artifacts"];
  budget: GraphRunState["budget"];
  terminal?: GraphRunState["terminal"];
  controls: Array<"pause" | "cancel" | "retry">;
  replayPolicy: string;
};

export function graphReplayPacket(run: GraphRunState): GraphReplayPacket {
  return {
    runId: run.runId,
    graphId: run.graphId,
    status: run.status,
    revision: run.revision,
    updatedAt: run.updatedAt,
    nodes: Object.values(run.results).map((result) => ({
      id: result.nodeId,
      type: result.type,
      status: result.status,
      attempts: run.attempts.filter((attempt) => attempt.nodeId === result.nodeId).length,
    })),
    timeline: replayTimeline(run).sort((left, right) => left.at.localeCompare(right.at)),
    artifacts: run.artifacts,
    budget: run.budget,
    terminal: run.terminal,
    controls: availableControls(run),
    replayPolicy: "Recorded decisions may be inspected; model calls and side effects are never replayed by default.",
  };
}

export async function listGraphReplayPackets(dataDir: string): Promise<GraphReplayPacket[]> {
  const files = await readdir(`${dataDir}/workflow-runs`).catch(() => [] as string[]);
  const runs = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => loadGraphRunState(dataDir, file.slice(0, -5))));
  return runs.filter((run): run is GraphRunState => Boolean(run)).map(graphReplayPacket).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function formatGraphHandoff(packet: GraphReplayPacket): string {
  const lines = [
    `Graph run ${packet.runId} · ${packet.graphId} · ${packet.status} · revision ${packet.revision}`,
    `Updated ${packet.updatedAt} · ${packet.nodes.length} nodes · ${packet.artifacts.length} artifacts`,
    packet.terminal ? `Stop: ${packet.terminal.state} — ${packet.terminal.reason}` : "Stop: run is active",
    `Budget: ${packet.budget.usedTokens} tokens · $${packet.budget.usedUsd.toFixed(4)}`,
    "",
    ...packet.nodes.map((node) => `${node.id} · ${node.type} · ${node.status} · ${node.attempts} attempt(s)`),
    "",
    packet.replayPolicy,
  ];
  return `${lines.join("\n")}\n`;
}

function replayTimeline(run: GraphRunState): ReplayEvent[] {
  const attempts = run.attempts.map((attempt) => {
    const type = run.results[attempt.nodeId]?.type;
    const sideEffect = type === "action" || type === "browser";
    return { at: attempt.finishedAt, kind: sideEffect ? "side_effect" as const : "model_call" as const, label: `${attempt.nodeId} ${attempt.status}`, nodeId: attempt.nodeId, replay: sideEffect ? "never_by_default" as const : "not_replayed" as const };
  });
  const decisions = run.decisions.map((item) => ({ at: item.at, kind: "decision" as const, label: `${item.from} → ${item.to ?? "stop"} (${item.kind})`, nodeId: item.from, replay: "recorded" as const }));
  const approvals = run.approvals.map((item) => ({ at: item.at, kind: "approval" as const, label: `${item.nodeId}: ${item.approved ? "approved" : "denied"}`, nodeId: item.nodeId, replay: "recorded" as const }));
  const mutations = run.mutations.map((item) => ({ at: item.at, kind: "state_diff" as const, label: `${item.nodeId}: ${item.fields.join(", ") || "no fields"} changed`, nodeId: item.nodeId, replay: "recorded" as const }));
  const topology = run.topologyChanges.map((item) => ({ at: item.at, kind: "topology" as const, label: `${item.status}: ${item.change.kind}`, nodeId: item.change.source, replay: "recorded" as const }));
  const control = run.operatorEvents.map((item) => ({ at: item.at, kind: "control" as const, label: `${item.action} at revision ${item.checkpointRevision}`, replay: "recorded" as const }));
  const stop = run.terminal ? [{ at: run.terminal.at, kind: "stop" as const, label: `${run.terminal.state}: ${run.terminal.reason}`, replay: "recorded" as const }] : [];
  return [...attempts, ...decisions, ...approvals, ...mutations, ...topology, ...control, ...stop];
}

function availableControls(run: GraphRunState): Array<"pause" | "cancel" | "retry"> {
  if (run.status === "running") return ["pause", "cancel"];
  return run.status === "done" ? [] : ["retry"];
}
