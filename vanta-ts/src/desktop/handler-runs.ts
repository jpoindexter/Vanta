import http from "node:http";
import { appendAttachmentReferences } from "./attachment-text.js";
import { deriveLegacyRuns } from "../runs/legacy.js";
import { appendRunLibraryMetric,deleteRun,listRuns,loadRun,previewReplay,saveRun,setRunSaved,type RunRecord } from "../runs/store.js";
import { providerIdFor } from "../sessions/model-scope.js";
import { listAllSessions,loadSession,newSessionId } from "../sessions/store.js";
import { attachConversation,ensureDesktopConversation,persistActiveSession } from "./handler-conversation.js";
import { readJson,sendJson } from "./handler-http.js";
import { type DesktopState } from "./handler-state.js";
import { saveDesktopSessionDraft } from "./session-draft-store.js";

export async function allRunsWithLegacy(root: string): Promise<RunRecord[]> {
  const captured = await listRuns({}, process.env);
  const capturedTurns = new Set(captured.map((run) => `${run.sessionId}:${run.turnIndex}`));
  const legacy: RunRecord[] = [];
  for (const meta of await listAllSessions(process.env)) {
    const session = await loadSession(meta.id, process.env);
    if (!session) continue;
    legacy.push(...deriveLegacyRuns(session, root).filter((run) => !capturedTurns.has(`${run.sessionId}:${run.turnIndex}`)));
  }
  return [...captured, ...legacy].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export async function resolveLibraryRun(id: string, root: string): Promise<RunRecord | null> {
  const stored = await loadRun(id, process.env);
  if (stored) return stored;
  return (await allRunsWithLegacy(root)).find((run) => run.id === id) ?? null;
}

export async function handleRuns(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/api/runs", "http://localhost");
  const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const savedOnly = url.searchParams.get("saved") === "1";
  const runs = (await allRunsWithLegacy(state.root))
    .filter((run) => !savedOnly || run.saved)
    .filter((run) => !query || `${run.title}\n${run.prompt}\n${run.inputs.map((input) => input.path).join("\n")}`.toLowerCase().includes(query));
  sendJson(res, 200, runs);
}

type RunActionBody = {
    action?: unknown;
    id?: unknown;
    saved?: unknown;
    prompt?: unknown;
    files?: unknown;
    acknowledgeDrift?: unknown;
};

export async function handleRunAction(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as RunActionBody;
  const action = typeof body.action === "string" ? body.action : "get";
  const id = typeof body.id === "string" ? body.id : "";
  const run = id ? await resolveLibraryRun(id, state.root) : null;
  if (!run) return sendJson(res, 404, { error: "run not found" });
  if (action === "get") return sendJson(res, 200, run);
  if (action === "save") {
    return sendJson(res, 200, await saveLibraryRun(run, body.saved !== false));
  }
  if (action === "delete") {
    if (!await loadRun(run.id, process.env)) return sendJson(res, 409, { error: "save this legacy run before deleting its library copy" });
    await deleteRun(run.id, process.env);
    await appendRunLibraryMetric("run_deleted", {}, process.env).catch(() => undefined);
    return sendJson(res, 200, { id: run.id, deleted: true });
  }
  await prepareLibraryReplay(state, { body, run, action }, res);
}

async function saveLibraryRun(run: RunRecord, saved: boolean): Promise<RunRecord | null> {
  return run.provenance === "derived"
    ? await saveRun({ ...run, saved }, process.env)
    : await setRunSaved(run.id, saved, process.env);
}

async function prepareLibraryReplay(state: DesktopState, request: { body: RunActionBody; run: RunRecord; action: string }, res: http.ServerResponse): Promise<void> {
  const { body, run, action } = request;
  const live = await ensureDesktopConversation(state);
  const preview = await previewReplay(run, {
    projectRoot: state.root,
    providerId: state.providerId,
    modelId: state.modelId,
    tools: live.setup.registry.list().map((tool) => tool.schema.name),
  });
  if (action === "preview") return sendJson(res, 200, preview);
  if (action !== "fork" && action !== "replay") return sendJson(res, 400, { error: "unsupported run action" });
  if (action === "replay" && !preview.canExecute && body.acknowledgeDrift !== true) {
    await appendRunLibraryMetric("run_replay_blocked", { driftCount: preview.inputs.filter((input) => input.state !== "ready").length }, process.env).catch(() => undefined);
    return sendJson(res, 409, { error: "replay inputs changed or are unavailable; fork the run or explicitly acknowledge the drift", preview });
  }
  const { files, prompt } = replayInputs(body, run);
  state.sessionId = newSessionId();
  state.sessionStarted = new Date().toISOString();
  state.providerId = providerIdFor(live.setup.provider, process.env);
  state.modelId = live.setup.provider.modelId();
  attachConversation(state, live.setup);
  state.pendingRunLineage = { mode: action, parentRunId: run.id };
  state.pendingRunPreparedAt = Date.now();
  state.forceFreshApprovals = action === "replay";
  await persistActiveSession(state);
  const draft = appendAttachmentReferences(prompt, files);
  await saveDesktopSessionDraft(state.root, state.sessionId, draft, process.env);
  await appendRunLibraryMetric(action === "fork" ? "run_fork_prepared" : "run_replay_prepared", { driftCount: preview.inputs.filter((input) => input.state !== "ready").length }, process.env).catch(() => undefined);
  sendJson(res, 200, { sessionId: state.sessionId, prompt, draft, files, lineage: state.pendingRunLineage, preview });
}

function replayInputs(body: RunActionBody, run: RunRecord): { files: string[]; prompt: string } {
  const files = Array.isArray(body.files)
    ? body.files.filter((file): file is string => typeof file === "string")
    : run.inputs.filter((input) => input.capture !== "redacted" && input.capture !== "missing").map((input) => input.path);
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : run.prompt;
  return { files, prompt };
}
