import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  hashTaskTimeline,
  isCurrentBacktestCertification,
  runBacktest,
  type BacktestReport,
} from "./backtest.js";
import type { CommitActionRequest, ControlledCommitResult } from "./controlled-commit.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import { installTaskModel, type TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord } from "./timeline.js";
import type { DesktopRunReceipt } from "../types.js";

const CounterexampleSchema = z.object({
  modelVersion: z.number().int().positive(),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  path: z.string().min(1),
  predicted: z.unknown(),
  observed: z.unknown(),
});

export const CounterexampleEpisodeSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{24}$/),
  planId: z.string().min(1),
  status: z.enum(["open", "revision_failed", "recertified"]),
  failedModelVersion: z.number().int().positive(),
  completedTransitions: z.array(z.object({ runId: z.string(), sequence: z.number().int().positive() })),
  remainingActions: z.array(z.object({ action: z.unknown(), risk: z.enum(["low", "medium", "high"]), reason: z.string() })),
  counterexample: CounterexampleSchema,
  createdAt: z.string().datetime(),
  revisionKind: z.enum(["state", "model"]).optional(),
  newModelVersion: z.number().int().positive().optional(),
  safeNextAction: z.enum(["revise_state_or_model", "fix_revision_and_recertify", "resume_plan"]),
});

export type CounterexampleEpisode = z.infer<typeof CounterexampleEpisodeSchema>;

function episodeDirectory(root: string): string {
  return join(root, "schema", "counterexamples");
}

function episodePath(root: string, id: string): string {
  return join(episodeDirectory(root), `${id}.json`);
}

async function persistEpisode(root: string, episode: CounterexampleEpisode): Promise<void> {
  const directory = episodeDirectory(root);
  await mkdir(directory, { recursive: true });
  const target = episodePath(root, episode.id);
  const temporary = join(directory, `.${episode.id}-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(episode, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function openCounterexampleEpisode(root: string, input: {
  planId: string;
  actions: readonly CommitActionRequest[];
  result: ControlledCommitResult;
  createdAt?: string;
}): Promise<CounterexampleEpisode> {
  if (input.result.ok || input.result.error.code !== "prediction_mismatch" || !input.result.error.counterexample) {
    throw new Error("a prediction_mismatch commit result is required");
  }
  const counterexample = input.result.error.counterexample;
  const failedIndex = Math.max(0, input.result.records.length - 1);
  const id = createHash("sha256").update(JSON.stringify({ planId: input.planId, counterexample })).digest("hex").slice(0, 24);
  const episode = CounterexampleEpisodeSchema.parse({
    version: 1,
    id,
    planId: input.planId,
    status: "open",
    failedModelVersion: counterexample.modelVersion,
    completedTransitions: input.result.records.map((record) => ({ runId: record.runId, sequence: record.sequence })),
    remainingActions: input.actions.slice(failedIndex + 1),
    counterexample,
    createdAt: input.createdAt ?? new Date().toISOString(),
    safeNextAction: "revise_state_or_model",
  });
  await persistEpisode(root, episode);
  return episode;
}

export async function readCounterexampleEpisode(root: string, id: string): Promise<CounterexampleEpisode | undefined> {
  if (!/^[a-f0-9]{24}$/.test(id)) return undefined;
  try { return CounterexampleEpisodeSchema.parse(JSON.parse(await readFile(episodePath(root, id), "utf8"))); } catch { return undefined; }
}

export async function readLatestCounterexampleEpisode(root: string): Promise<CounterexampleEpisode | undefined> {
  try {
    const files = (await readdir(episodeDirectory(root))).filter((file) => /^[a-f0-9]{24}\.json$/.test(file)).sort();
    const episodes = (await Promise.all(files.map((file) => readCounterexampleEpisode(root, file.slice(0, -5)))))
      .filter((episode): episode is CounterexampleEpisode => Boolean(episode));
    return episodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  } catch { return undefined; }
}

export async function reviseAndRecertifyCounterexample(options: {
  root: string;
  episodeId: string;
  revisionKind: "state" | "model";
  modelRoot: string;
  priorArtifact: TaskModelArtifact;
  source: string;
  state: GroundedState;
  action: unknown;
  revisedHistory: readonly TaskTimelineRecord[];
  sourceTransitions: Array<{ runId: string; sequence: number }>;
  createdAt?: string;
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
}): Promise<{ episode: CounterexampleEpisode; artifact?: TaskModelArtifact; report?: BacktestReport }> {
  const episode = await readCounterexampleEpisode(options.root, options.episodeId);
  if (!episode) throw new Error("counterexample episode not found");
  const nextVersion = episode.failedModelVersion + 1;
  const installed = await installTaskModel({
    root: options.modelRoot,
    taskId: options.priorArtifact.manifest.taskId,
    modelVersion: nextVersion,
    source: options.source,
    state: options.state,
    action: options.action,
    timeline: options.revisedHistory,
    sourceTransitions: options.sourceTransitions,
    createdAt: options.createdAt,
    recordReceipt: options.recordReceipt,
  });
  if (!installed.ok) {
    const failed = CounterexampleEpisodeSchema.parse({ ...episode, status: "revision_failed", revisionKind: options.revisionKind, safeNextAction: "fix_revision_and_recertify" });
    await persistEpisode(options.root, failed);
    return { episode: failed };
  }
  const report = await runBacktest({ artifact: installed.artifact, timeline: options.revisedHistory, recordReceipt: options.recordReceipt });
  const updated = CounterexampleEpisodeSchema.parse({
    ...episode,
    status: report.certified ? "recertified" : "revision_failed",
    revisionKind: options.revisionKind,
    newModelVersion: installed.artifact.manifest.modelVersion,
    safeNextAction: report.certified ? "resume_plan" : "fix_revision_and_recertify",
  });
  await persistEpisode(options.root, updated);
  return { episode: updated, artifact: installed.artifact, report };
}

export function canResumeCounterexample(
  episode: CounterexampleEpisode,
  artifact: TaskModelArtifact,
  report: BacktestReport,
  history: readonly TaskTimelineRecord[],
): boolean {
  return episode.status === "recertified"
    && episode.newModelVersion === artifact.manifest.modelVersion
    && artifact.manifest.modelVersion > episode.failedModelVersion
    && report.modelVersion === artifact.manifest.modelVersion
    && report.timelineHash === hashTaskTimeline(history)
    && isCurrentBacktestCertification(report);
}

function display(value: unknown): string {
  const text = JSON.stringify(value);
  return text && text.length > 120 ? `${text.slice(0, 117)}...` : text ?? String(value);
}

export function formatCounterexampleForCli(episode: CounterexampleEpisode): string {
  return [
    `Schema recovery: ${episode.status}`,
    `Plan: ${episode.planId} · failed model v${episode.failedModelVersion}`,
    `Transition: ${episode.counterexample.runId}:${episode.counterexample.sequence}`,
    `Mismatch: ${episode.counterexample.path}`,
    `Predicted: ${display(episode.counterexample.predicted)}`,
    `Observed: ${display(episode.counterexample.observed)}`,
    `Remaining actions: ${episode.remainingActions.length}`,
    `Safe next action: ${episode.safeNextAction.replaceAll("_", " ")}`,
  ].join("\n");
}

export function counterexampleDesktopReceipt(episode: CounterexampleEpisode, evidence: {
  report?: BacktestReport;
  modelDiffSummary?: string[];
} = {}): DesktopRunReceipt {
  return {
    status: "failed",
    failureKind: "model_mismatch",
    events: [{ label: `Model diverged at ${episode.counterexample.path}`, ok: false }],
    actions: episode.status === "recertified"
      ? ["retry_failed_step", "edit_request", "start_from_checkpoint"]
      : ["edit_request", "start_from_checkpoint"],
    checkpoint: { instruction: `Recover plan ${episode.planId} from counterexample ${episode.id}` },
    counterexample: {
      modelVersion: episode.failedModelVersion,
      transition: `${episode.counterexample.runId}:${episode.counterexample.sequence}`,
      path: episode.counterexample.path,
      predicted: display(episode.counterexample.predicted),
      observed: display(episode.counterexample.observed),
      safeNextAction: episode.safeNextAction.replaceAll("_", " "),
    },
    schemaTrace: {
      planId: episode.planId,
      runId: episode.counterexample.runId,
      queue: {
        status: episode.status === "recertified" ? "resumed" : "stopped",
        reason: episode.status === "recertified"
          ? `Model v${episode.newModelVersion} recertified; remaining actions may resume.`
          : `Prediction mismatch at ${episode.counterexample.path}; remaining actions discarded.`,
      },
      certification: {
        certified: episode.status === "recertified",
        modelVersion: episode.newModelVersion ?? episode.failedModelVersion,
        coverage: episode.status === "recertified" ? "Complete history recertified" : "Certification invalidated by counterexample",
      },
      transitions: [{
        id: `${episode.counterexample.runId}:${episode.counterexample.sequence}`,
        sequence: episode.counterexample.sequence,
        label: episode.status === "recertified" ? "Recovered transition" : "Prediction mismatch",
        actionMode: "real",
        status: episode.status === "recertified" ? "revised" : "mismatch",
        modelVersion: episode.newModelVersion ?? episode.failedModelVersion,
        path: episode.counterexample.path,
        predicted: display(episode.counterexample.predicted),
        observed: display(episode.counterexample.observed),
        ...(episode.status === "recertified" && episode.newModelVersion ? {
          modelDiff: {
            fromVersion: episode.failedModelVersion,
            toVersion: episode.newModelVersion,
            summary: evidence.modelDiffSummary ?? [`${episode.revisionKind ?? "model"} revision incorporated the retained counterexample`],
          },
        } : {}),
        ...(evidence.report ? {
          backtest: {
            certified: evidence.report.certified,
            matchedTransitions: evidence.report.coverage.exact,
            totalTransitions: evidence.report.coverage.transitions,
            timelineHash: evidence.report.timelineHash,
          },
        } : {}),
      }],
    },
  };
}
