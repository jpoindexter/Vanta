import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateComposableWorkflow } from "./composer-validation.js";
import { runWorkflowGraph } from "./execute.js";
import { formatGraphHandoff, graphReplayPacket } from "./replay.js";
import { runAdaptiveReleaseProof } from "./release-proof-adaptive.js";
import { releaseProofDeps, releaseProofGraph } from "./release-proof-fixture.js";
import { loadGraphRunState } from "./run-state-store.js";

export type GraphV1ProofSummary = {
  main: { status: string; writes: number; restarted: boolean; parallelResearchers: number; builderAttempts: number; reviewerAttempts: number; approval: boolean; acceptance: boolean };
  adaptive: { status: string; change: string; changes: number };
  failure: { status: string; escalated: boolean; falseDone: boolean };
  budget: { tokens: number; costUsd: number };
  replay: { events: number; handoffWritten: boolean };
};

export async function runReleaseProofPhase(projectRoot: string, crashReviewer: boolean): Promise<{ status: string; reason: string }> {
  const graph = releaseProofGraph();
  assertComposable(graph);
  const result = await runWorkflowGraph(graph, releaseProofDeps(projectRoot, { crashReviewer }), {
    dataDir: join(projectRoot, ".vanta"), runId: "main-release",
  });
  return { status: result.terminalState, reason: result.reason };
}

export async function verifyGraphV1ReleaseProof(projectRoot: string): Promise<GraphV1ProofSummary> {
  const dataDir = join(projectRoot, ".vanta");
  const run = await loadGraphRunState(dataDir, "main-release");
  if (!run) throw new Error("main release run was not persisted");
  const writes = await writeCount(projectRoot, "release.txt");
  assertMainRun(run, writes);
  const adaptive = await runAdaptiveReleaseProof(dataDir);
  const failure = await runFailureProof(projectRoot, dataDir);
  const packet = graphReplayPacket(run);
  const handoff = formatGraphHandoff(packet);
  await writeFile(join(projectRoot, "graph-v1-handoff.txt"), handoff, "utf8");
  return {
    main: {
      status: run.terminal!.state, writes, restarted: run.attempts.filter((item) => item.nodeId === "review").length === 3,
      parallelResearchers: ["research-a", "research-b"].filter((id) => run.results[id]?.status === "ok").length,
      builderAttempts: attempts(run, "builder"), reviewerAttempts: attempts(run, "review"),
      approval: run.approvals.some((item) => item.nodeId === "gate" && item.approved),
      acceptance: run.evidence.some((item) => item.id === "acceptance" && item.passed),
    },
    adaptive,
    failure,
    budget: { tokens: run.budget.usedTokens, costUsd: run.budget.usedUsd },
    replay: { events: packet.timeline.length, handoffWritten: handoff.includes("never replayed by default") },
  };
}

async function runFailureProof(projectRoot: string, dataDir: string): Promise<GraphV1ProofSummary["failure"]> {
  const graph = releaseProofGraph(1);
  const result = await runWorkflowGraph(graph, releaseProofDeps(projectRoot, { alwaysReject: true, outputName: "failure.txt" }), {
    dataDir, runId: "exhausted-release",
  });
  const run = await loadGraphRunState(dataDir, "exhausted-release");
  const escalated = run?.approvals.some((item) => item.nodeId === "escalate" && item.approved) ?? false;
  if (result.terminalState !== "exhausted" || !escalated || run?.evidence.some((item) => item.id === "acceptance" && item.passed)) {
    throw new Error("failed fixture did not exhaust and escalate safely");
  }
  return { status: result.terminalState, escalated, falseDone: false };
}

function assertMainRun(run: NonNullable<Awaited<ReturnType<typeof loadGraphRunState>>>, writes: number): void {
  const checks = [
    [run.terminal?.state === "succeeded", "main run did not succeed"],
    [writes === 2, `confirmed builder effects were duplicated (${writes} writes)`],
    [attempts(run, "planner") === 1, "planner replayed after restart"],
    [attempts(run, "research-a") === 1 && attempts(run, "research-b") === 1, "parallel research replayed after restart"],
    [attempts(run, "builder") === 2, "builder did not perform exactly one required revision"],
    [attempts(run, "review") === 3, "review restart/rejection/acceptance sequence missing"],
    [run.decisions.some((item) => item.kind === "parallel-join"), "parallel fan-in decision missing"],
    [run.approvals.some((item) => item.nodeId === "gate" && item.approved), "human approval missing"],
    [run.evidence.some((item) => item.id === "acceptance" && item.passed), "executable acceptance receipt missing"],
    [run.budget.usedTokens <= 2_000 && run.budget.usedUsd <= 1, "declared budget exceeded"],
  ] as const;
  const failed = checks.find(([passed]) => !passed);
  if (failed) throw new Error(failed[1]);
}

function assertComposable(graph: ReturnType<typeof releaseProofGraph>): void {
  const errors = validateComposableWorkflow(graph);
  if (errors.length) throw new Error(`release workflow invalid: ${errors.join("; ")}`);
}

function attempts(run: NonNullable<Awaited<ReturnType<typeof loadGraphRunState>>>, nodeId: string): number {
  return run.attempts.filter((item) => item.nodeId === nodeId).length;
}

async function writeCount(projectRoot: string, outputName: string): Promise<number> {
  const raw = await readFile(join(projectRoot, `${outputName}.writes`), "utf8");
  return raw.trim().split("\n").filter(Boolean).length;
}
