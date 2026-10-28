import { realpathSync } from "node:fs";
import type http from "node:http";
import { resolveVantaHome } from "../store/home.js";
import type { AgentOutcome } from "../agent.js";
import type { DesktopRunReceipt } from "../types.js";
import type { DesktopEvent, DesktopState } from "./handler-state.js";
import { sendJson } from "./handler-http.js";

export type DesktopChatResult = Pick<AgentOutcome, "finalText" | "usage"> & {
  stoppedReason?: string;
  sessionId?: string;
  events?: DesktopEvent[];
  interrupted?: boolean;
  receipt?: DesktopRunReceipt;
};

export type DesktopChatRun = { requestId: string; sessionId: string; result?: DesktopChatResult };

export class LiveSessionConflict extends Error {}

type SessionVersion = { clientId: string; state: DesktopState; run: DesktopChatRun | undefined;
  active: boolean; result: DesktopChatResult | undefined; approval: DesktopState["pendingApproval"] };
export type SessionOpenCursor = { scope: string; versions: SessionVersion[]; live?: { clientId: string; state: DesktopState; requestId: string } };

export function validLiveRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/i.test(value);
}

function profileOf(state: DesktopState): string {
  return state._env?.VANTA_PROFILE?.trim() || "default";
}

function scopeOf(state: DesktopState): string {
  return JSON.stringify([realpathSync(state.root), realpathSync(resolveVantaHome(state._env)), profileOf(state)]);
}

function boundRun(candidate: DesktopState, storedId: string): DesktopChatRun {
  const run = candidate._chatRun;
  if (!storedId || candidate.sessionId !== storedId || !candidate.convo || !run ||
      run.sessionId !== storedId || !validLiveRequestId(run.requestId)) {
    throw new LiveSessionConflict("The original live chat identity is unavailable.");
  }
  return run;
}

function assertBinding(caller: DesktopState, candidate: DesktopState, storedId: string): DesktopChatRun {
  const run = boundRun(candidate, storedId);
  try {
    if (scopeOf(caller) !== scopeOf(candidate)) throw new Error("scope mismatch");
  } catch {
    throw new LiveSessionConflict("The live chat does not match this profile and project.");
  }
  if (!run.result && (!candidate._chatActive || !candidate._chatAbort || candidate._chatAbort.signal.aborted)) {
    throw new LiveSessionConflict("The original live turn is no longer observable.");
  }
  return run;
}

function liveEnvelope(caller: DesktopState, candidate: DesktopState, clientId: string, storedId: string) {
  const run = assertBinding(caller, candidate, storedId);
  return {
    id: storedId,
    messages: candidate.convo!.messages.filter(message => message.role !== "system"),
    ...(candidate.providerId ? { providerId: candidate.providerId } : {}),
    ...(candidate.modelId ? { modelId: candidate.modelId } : {}),
    live: {
      clientId, requestId: run.requestId, root: realpathSync(candidate.root), profile: profileOf(candidate),
      running: !run.result,
      ...(run.result ? { result: run.result } : {}),
    },
  };
}

function sessionVersions(state: DesktopState, storedId: string): SessionVersion[] {
  return [...state._sessions?.entries() ?? []].filter(([, candidate]) => candidate.sessionId === storedId)
    .map(([clientId, candidate]) => ({ clientId, state: candidate, run: candidate._chatRun,
      active: candidate._chatActive === true, result: candidate._chatRun?.result, approval: candidate.pendingApproval }));
}

/** Capture before disk/setup awaits. Only this original live request may survive terminal cleanup. */
export function captureSessionOpen(state: DesktopState, storedId: string): SessionOpenCursor {
  const versions = sessionVersions(state, storedId);
  const active = versions.filter(version => version.active || version.approval);
  if (active.length > 1) throw new LiveSessionConflict("More than one live turn owns this saved chat. Review it before continuing.");
  const selected = active[0];
  const run = selected ? assertBinding(state, selected.state, storedId) : undefined;
  return { scope: scopeOf(state), versions,
    ...(selected && run ? { live: { clientId: selected.clientId, state: selected.state, requestId: run.requestId } } : {}) };
}

function unchangedVersions(before: SessionVersion[], after: SessionVersion[]): boolean {
  return before.length === after.length && before.every((old, index) => {
    const next = after[index];
    return next?.clientId === old.clientId && next.state === old.state && next.run === old.run &&
      next.active === old.active && next.result === old.result && next.approval === old.approval;
  });
}

function candidateForCursor(state: DesktopState, storedId: string, cursor: SessionOpenCursor) {
  if (scopeOf(state) !== cursor.scope) throw new LiveSessionConflict("The requested profile or project changed while opening.");
  const live = cursor.live;
  if (!live) {
    if (!unchangedVersions(cursor.versions, sessionVersions(state, storedId))) throw new LiveSessionConflict("The saved chat changed while opening. Reopen it before continuing.");
    return undefined;
  }
  const run = assertBinding(state, live.state, storedId);
  if (state._sessions?.get(live.clientId) !== live.state || run.requestId !== live.requestId) {
    throw new LiveSessionConflict("The original live turn changed while opening.");
  }
  return live;
}

function selectLiveCandidate(state: DesktopState, storedId: string, captured: SessionOpenCursor["live"]) {
  const matches = [...state._sessions?.entries() ?? []].filter(([, candidate]) =>
    candidate.sessionId === storedId && (candidate._chatActive || candidate.pendingApproval));
  if (matches.length > 1) throw new LiveSessionConflict("More than one live turn owns this saved chat. Review it before continuing.");
  if (captured && matches.some(([id, candidate]) => id !== captured.clientId || candidate !== captured.state)) {
    throw new LiveSessionConflict("Another live turn claimed this saved chat while opening.");
  }
  const match = captured ? [captured.clientId, captured.state] as const : matches[0];
  return match;
}

/** Search only this authenticated backend's state map; never alias its map keys. */
export function discoverLiveSession(state: DesktopState, storedId: string, storedRoot: string | undefined, cursor?: SessionOpenCursor) {
  const captured = cursor ? candidateForCursor(state, storedId, cursor) : undefined;
  const match = selectLiveCandidate(state, storedId, captured);
  if (!match) return undefined;
  const [clientId, candidate] = match;
  try {
    if (!storedRoot || realpathSync(storedRoot) !== realpathSync(candidate.root)) throw new Error("project mismatch");
  } catch {
    throw new LiveSessionConflict("The saved chat project does not match its live turn.");
  }
  return liveEnvelope(state, candidate, clientId, storedId);
}

/** Observe an exact original client/turn. Missing state is not successful completion. */
export function observeLiveSession(state: DesktopState, clientId: string, storedId: string, requestId: string) {
  if (!clientId || !validLiveRequestId(requestId) || state._sessions?.get(clientId) !== state) {
    throw new LiveSessionConflict("The original runtime client is unavailable.");
  }
  const run = assertBinding(state, state, storedId);
  if (run.requestId !== requestId) throw new LiveSessionConflict("The requested live turn has changed.");
  return liveEnvelope(state, state, clientId, storedId);
}

/** Retain the authoritative terminal response before notifying observers. */
export function retainChatResult(state: DesktopState, requestId: string | undefined, result: DesktopChatResult): void {
  if (!requestId || state._chatRun?.requestId !== requestId) return;
  state._chatRun.result = result;
}

export async function handleLiveSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  try {
    if (query.getAll("storedId").length !== 1 || query.getAll("requestId").length !== 1) throw new Error("The exact saved chat and request are required.");
    const live = observeLiveSession(state, state._sseSessionId ?? "", query.get("storedId") ?? "", query.get("requestId") ?? "");
    sendJson(res, 200, live);
  } catch (error) {
    sendJson(res, 409, { error: error instanceof Error ? error.message : "The live chat is unavailable." });
  }
}
