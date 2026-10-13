import type { StreamEvent } from "../agent.js";
import type { DesktopEvent } from "./handler-state.js";
import { pushSseEvent, type SseClients } from "./session-state.js";
import {
  thinkingEvent, toolCompleteEvent, toolStartEvent, turnCompleteEvent,
  type TurnCompleteInput, type TypedDesktopEvent,
} from "./typed-events.js";

/** The slice of DesktopState the typed emitters need. */
export type TypedEventHost = {
  _sseClients?: SseClients;
  _sseSessionId?: string;
  _toolIds?: ToolIdTracker;
};

/**
 * StreamEvent tool_start/tool_end carry no call id, so the desktop mints one
 * per start (`tool-<n>`, monotonic per DesktopState) and pairs each end with the
 * oldest open start of the same tool name (FIFO per name).
 *
 * Assumption: calls of one tool name complete in the order they started. True
 * for the sequential loop. NOT guaranteed when concurrency-safe read tools
 * overlap (streaming prefetch / VANTA_PARALLEL_TOOLS): two same-name calls can
 * then swap outputs. Start/complete counts stay balanced; only the pairing of
 * those same-name overlapping calls can be wrong.
 */
export type ToolIdTracker = { seq: number; open: Map<string, string[]> };

function tracker(host: TypedEventHost): ToolIdTracker {
  host._toolIds ??= { seq: 0, open: new Map() };
  return host._toolIds;
}

function mintToolId(host: TypedEventHost): string {
  const t = tracker(host);
  t.seq += 1;
  return `tool-${t.seq}`;
}

/** Drop unmatched starts at a turn boundary; the counter keeps climbing so ids stay unique. */
export function resetToolIds(host: TypedEventHost): void {
  if (host._toolIds) host._toolIds.open.clear();
}

function openToolId(host: TypedEventHost, name: string): string {
  const id = mintToolId(host);
  const queue = tracker(host).open.get(name) ?? [];
  queue.push(id);
  tracker(host).open.set(name, queue);
  return id;
}

/** Oldest open id for the name; an end with no open start (should not happen) gets a fresh id. */
function closeToolId(host: TypedEventHost, name: string): string {
  const queue = tracker(host).open.get(name);
  const id = queue?.shift();
  if (queue && !queue.length) tracker(host).open.delete(name);
  return id ?? mintToolId(host);
}

/** Map one agent StreamEvent to its typed event, or null when it has none. */
export function typedFromStreamEvent(host: TypedEventHost, event: StreamEvent): TypedDesktopEvent | null {
  if (event.type === "tool_start") return toolStartEvent(openToolId(host, event.name), event.name, event.args);
  if (event.type === "tool_end") return toolCompleteEvent(closeToolId(host, event.name), event.name, event.ok, event.output);
  if (event.type === "thinking") return thinkingEvent(event.text);
  return null;
}

/** Send one frame to this state's SSE clients; never throws into the agent loop. */
export function pushFrame(host: TypedEventHost, frame: DesktopEvent): void {
  if (!host._sseClients || !host._sseSessionId) return;
  try { pushSseEvent(host._sseClients, host._sseSessionId, frame); } catch { /* SSE is best-effort; the HTTP response stays authoritative. */ }
}

/** Typed-only frame: empty label so the legacy renderer ignores it. */
export function pushTypedEvent(host: TypedEventHost, typed: TypedDesktopEvent | null): void {
  if (typed) pushFrame(host, { label: "", typed });
}

/** Session id comes from the state, so callers pass only the outcome. */
export function pushTurnComplete(host: TypedEventHost & { sessionId?: string }, input: Omit<TurnCompleteInput, "sessionId">): void {
  pushTypedEvent(host, turnCompleteEvent({ ...input, sessionId: host.sessionId ?? "" }));
}
