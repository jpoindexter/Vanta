import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type http from "node:http";
import { dispatchTool } from "../agent/dispatch-tool.js";
import { requestGraphRunControl } from "../workflow/run-control.js";
import { graphReplayPacket } from "../workflow/replay.js";
import { loadGraphRunState, updateGraphRun } from "../workflow/run-state-store.js";
import type { GraphRunState } from "../workflow/run-state.js";
import type { ToolContext } from "../tools/types.js";
import { requestWebApproval } from "./approval.js";
import { permissionModeForAccess } from "./access-mode.js";
import { ensureDesktopConversation } from "./handler-conversation.js";
import { sendJson } from "./handler-http.js";
import type { DesktopState } from "./handler-state.js";
import { workflowResumeSource } from "./workflow-resume-source.js";

export async function resumeDesktopWorkflow(state: DesktopState, run: GraphRunState, res: http.ServerResponse): Promise<void> {
  let accepted = false;
  try {
    if (run.status !== "paused" || run.terminal?.state !== "paused") throw new Error("Only paused checkpoints can resume; inspect uncertain effects before starting new work.");
    const graph = await workflowResumeSource(state.root, run);
    const live = await ensureDesktopConversation(state);
    const ctx: ToolContext = {
      root: state.root, sessionId: state.sessionId, safety: live.setup.safety,
      permissionMode: () => permissionModeForAccess(state.accessMode ?? "approve"),
      requestApproval: (action, reason, toolName, detail) => state._sseSessionId && state._sseClients?.get(state._sseSessionId)?.size
        ? requestWebApproval(state, action, reason, { toolName, detail }) : Promise.resolve(false),
      onToolExecutionStart: async () => {
        const updated = await requestGraphRunControl(join(state.root, ".vanta"), run.runId, "retry");
        accepted = true;
        sendJson(res, 202, graphReplayPacket(updated));
      },
    };
    const result = await dispatchTool({ id: `desktop-workflow-resume:${randomUUID()}`, name: "compose_workflow",
      arguments: { spec: graph, run_id: run.runId, resume: true } }, {
      ...ctx, provider: live.setup.provider, registry: live.setup.registry,
      planGate: () => state.accessMode === "plan",
    }, ctx);
    if (!accepted) sendJson(res, 403, { error: "Workflow resume was not authorized. The checkpoint is unchanged." });
    else if (!result.ok) await finishUnexpectedResume(state.root, run.runId);
  } catch (error) {
    if (!accepted) sendJson(res, 409, { error: error instanceof Error ? error.message : "Workflow could not resume." });
    else await finishUnexpectedResume(state.root, run.runId);
  }
}

async function finishUnexpectedResume(root: string, runId: string): Promise<void> {
  const dataDir = join(root, ".vanta");
  const current = await loadGraphRunState(dataDir, runId);
  if (current?.status !== "running") return;
  await updateGraphRun(dataDir, runId, run => run.status !== "running" ? run : ({ ...run, status: "error",
    terminal: { state: "failed", at: new Date().toISOString(), reason: "Resume stopped unexpectedly. Inspect receipts before starting new work." } }));
}
