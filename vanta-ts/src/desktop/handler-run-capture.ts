import { appendRunLibraryMetric,captureRunInputs,newRunId,saveRun,type RunRecord } from "../runs/store.js";
import { redactForLog } from "../store/redact-structural.js";
import { type DesktopState } from "./handler-state.js";

export function runTitle(instruction: string): string {
  const title = redactForLog(instruction).trim().replace(/\s+/g, " ");
  return title.length > 80 ? `${title.slice(0, 77)}...` : title || "Untitled run";
}

export async function beginRunCapture(
  state: DesktopState,
  instruction: string,
  files: string[],
  turnIndex: number,
): Promise<void> {
  const id = newRunId();
  const lineage = state.pendingRunLineage ?? { mode: "original" };
  if (lineage.mode !== "original") {
    await appendRunLibraryMetric("run_reuse_submitted", {
      mode: lineage.mode,
      elapsedMs: Math.max(0, Date.now() - (state.pendingRunPreparedAt ?? Date.now())),
    }, process.env).catch(() => undefined);
  }
  state.currentRunEvents = [];
  state.activeRunCapture = {
    id,
    instruction,
    startedAt: new Date().toISOString(),
    turnIndex,
    inputs: await captureRunInputs(state.root, files, id, process.env),
    lineage,
  };
  state.pendingRunLineage = undefined;
  state.pendingRunPreparedAt = undefined;
}

export async function finishRunCapture(
  state: DesktopState,
  status: RunRecord["status"],
  finalOutput: string,
  usage?: RunRecord["usage"],
): Promise<RunRecord | null> {
  const capture = state.activeRunCapture;
  if (!capture || !state.sessionId) return null;
  const record = await saveRun({
    version: 1,
    id: capture.id,
    sessionId: state.sessionId,
    turnIndex: capture.turnIndex,
    title: runTitle(capture.instruction),
    prompt: redactForLog(capture.instruction),
    projectRoot: state.root,
    providerId: state.providerId,
    modelId: state.modelId,
    startedAt: capture.startedAt,
    completedAt: new Date().toISOString(),
    status,
    saved: false,
    tags: [],
    provenance: "captured",
    lineage: capture.lineage,
    inputs: capture.inputs,
    events: state.currentRunEvents ?? [],
    finalOutput: redactForLog(finalOutput),
    ...(usage ? { usage } : {}),
  }, process.env);
  if (capture.lineage.mode !== "original") {
    await appendRunLibraryMetric("run_reuse_completed", {
      mode: capture.lineage.mode,
      status,
    }, process.env).catch(() => undefined);
  }
  state.activeRunCapture = undefined;
  state.currentRunEvents = undefined;
  state.forceFreshApprovals = false;
  return record;
}
