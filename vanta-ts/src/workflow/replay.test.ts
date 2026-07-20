import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graphReplayPacket, formatGraphHandoff, listGraphReplayPackets } from "./replay.js";
import { requestGraphRunControl } from "./run-control.js";
import { createGraphRunState, updateGraphRun } from "./run-state-store.js";
import { newGraphRunState } from "./run-state.js";
import type { WorkflowGraph } from "./schema.js";

const graph = {
  id: "operator-proof",
  title: "Operator proof",
  revision: 1,
  start: "plan",
  nodes: [
    { id: "plan", type: "agent", instruction: "plan" },
    { id: "write", type: "action", tool: "write_file", args: {}, sideEffect: true, approval: "always" },
    { id: "review", type: "review", instruction: "review" },
  ],
  transitions: [],
} as WorkflowGraph;

async function storedRun() {
  const dataDir = await mkdtemp(join(tmpdir(), "vanta-replay-"));
  const run = newGraphRunState(graph, "proof-run", "2026-07-20T12:00:00.000Z");
  await createGraphRunState(dataDir, run);
  return { dataDir, run };
}

describe("graph operator replay", () => {
  it("projects recorded decisions while refusing model and side-effect replay", async () => {
    const { dataDir } = await storedRun();
    const completed = await updateGraphRun(dataDir, "proof-run", (run) => ({
      ...run,
      status: "error",
      values: { secret: "must-not-leak" },
      results: {
        plan: { nodeId: "plan", type: "agent", status: "ok", output: "private plan", outputs: {}, handoffs: [] },
        write: { nodeId: "write", type: "action", status: "error", output: "private failure", outputs: {}, handoffs: [] },
      },
      attempts: [
        { nodeId: "plan", attempt: 1, startedAt: run.createdAt, finishedAt: run.updatedAt, status: "ok" },
        { nodeId: "write", attempt: 1, startedAt: run.createdAt, finishedAt: run.updatedAt, status: "error" },
      ],
      decisions: [{ from: "plan", to: "write", kind: "matched", at: run.updatedAt }],
      mutations: [{ nodeId: "plan", attempt: 1, revision: 1, fields: ["secret"], at: run.updatedAt }],
      terminal: { state: "failed", reason: "review rejected", at: run.updatedAt },
    }));
    const packet = graphReplayPacket(completed);
    expect(packet.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "model_call", replay: "not_replayed" }),
      expect.objectContaining({ kind: "side_effect", replay: "never_by_default" }),
      expect.objectContaining({ kind: "decision", replay: "recorded" }),
      expect.objectContaining({ kind: "state_diff", label: expect.stringContaining("secret") }),
    ]));
    expect(JSON.stringify(packet)).not.toContain("must-not-leak");
    expect(JSON.stringify(packet)).not.toContain("private plan");
    expect(formatGraphHandoff(packet)).toContain("never replayed by default");
    await expect(listGraphReplayPackets(dataDir)).resolves.toHaveLength(1);
  });

  it("persists pause/cancel intent and clears failed checkpoints for retry", async () => {
    const { dataDir } = await storedRun();
    const paused = await requestGraphRunControl(dataDir, "proof-run", "pause", "2026-07-20T12:01:00.000Z");
    expect(paused.operatorControl?.action).toBe("pause");
    await updateGraphRun(dataDir, "proof-run", (run) => ({ ...run, status: "paused", terminal: { state: "paused", reason: "operator pause requested", at: run.updatedAt } }));
    const retried = await requestGraphRunControl(dataDir, "proof-run", "retry", "2026-07-20T12:02:00.000Z");
    expect(retried).toMatchObject({ status: "running", operatorControl: undefined, terminal: undefined });
    expect(retried.operatorEvents.map((event) => event.action)).toEqual(["pause", "retry"]);
    const cancelled = await requestGraphRunControl(dataDir, "proof-run", "cancel", "2026-07-20T12:03:00.000Z");
    expect(cancelled.operatorControl?.action).toBe("cancel");
  });
});
