import { randomUUID } from "node:crypto";
import type { StreamEvent } from "../agent/agent-types.js";

// ACP session lifecycle — PURE + injectable. Owns the set of live sessions, maps
// an ACP `session/prompt` onto an injected agent runner, converts the agent's
// StreamEvents into `session/update` notifications, and routes a permission
// request to an injected approver. No transport, no LLM, no kernel here — every
// effect is a dependency, so it is unit-tested with fakes.

export type StopReason = "end_turn" | "cancelled" | "max_tokens" | "tool_calls" | "refusal";

/** What a host needs to drive one prompt turn: the user text + a cancel signal. */
export type RunRequest = {
  sessionId: string;
  prompt: string;
  signal: AbortSignal;
  /** Emit an agent StreamEvent — the session converts it to a session/update. */
  emit: (event: StreamEvent) => void;
  /** Ask the host to approve a gated action; resolves true=allow, false=deny. */
  approve: (action: string, reason: string, toolName?: string) => Promise<boolean>;
};

/** The injected agent runner: drives a Vanta conversation for one prompt turn. */
export type AgentRunner = (req: RunRequest) => Promise<{ stopReason: StopReason }>;

/** The injected sink for outbound `session/update` notifications + permission asks. */
export type SessionSink = {
  /** Send a `session/update` notification with the given update payload. */
  update: (sessionId: string, update: SessionUpdate) => void;
  /**
   * Send an agent→client `session/request_permission` request and await the
   * client's chosen option. Returns true when an allow option was selected.
   */
  requestPermission: (sessionId: string, req: PermissionRequest) => Promise<boolean>;
};

/** The `session/update` payload union (the subset Vanta emits). */
export type SessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "agent_thought_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "tool_call"; toolCallId: string; title: string; kind: string; status: "in_progress" }
  | { sessionUpdate: "tool_call_update"; toolCallId: string; status: "completed" | "failed"; content?: ToolCallContent[] }
  | { sessionUpdate: "current_mode_update"; modeId: string };

export type ToolCallContent = { type: "content"; content: { type: "text"; text: string } };

/** The permission ask carried to the client (mirrors ACP `request_permission`). */
export type PermissionRequest = {
  toolCall: { toolCallId: string; title: string };
  options: PermissionOption[];
};
export type PermissionOption = { optionId: string; name: string; kind: PermissionOptionKind };
export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

/** The two-option permission menu Vanta offers (allow-once / reject-once). */
export const PERMISSION_OPTIONS: PermissionOption[] = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];

type Session = {
  id: string;
  cwd: string;
  modeId: string;
  /** The current turn's abort controller, when a prompt is running. */
  abort?: AbortController;
};

/** Map an agent StreamEvent to its `session/update` payload, or null if it has none. */
export function eventToUpdate(event: StreamEvent): SessionUpdate | null {
  switch (event.type) {
    case "text_delta":
      return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.delta } };
    case "thinking":
      return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: event.text } };
    case "tool_start":
      return { sessionUpdate: "tool_call", toolCallId: toolId(event.name), title: event.name, kind: "other", status: "in_progress" };
    case "tool_end":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: toolId(event.name),
        status: event.ok ? "completed" : "failed",
        content: event.output ? [{ type: "content", content: { type: "text", text: event.output } }] : undefined,
      };
    default:
      return null; // text_complete/note/turn_end carry no incremental ACP update
  }
}

/** Stable per-tool-name id within a turn (the agent loop doesn't expose a call id here). */
function toolId(name: string): string {
  return `tool-${name}`;
}

/**
 * The session manager: pure orchestration over injected `runner` + `sink`. Holds
 * the live session map; the server wires it to a transport.
 */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly runner: AgentRunner,
    private readonly sink: SessionSink,
    private readonly defaultCwd: string,
  ) {}

  /** Create a new session; returns its id. */
  newSession(cwd?: string): { sessionId: string } {
    const id = randomUUID();
    this.sessions.set(id, { id, cwd: cwd ?? this.defaultCwd, modeId: "default" });
    return { sessionId: id };
  }

  /** Load (re-register) an existing session id so a client can resume against it. */
  loadSession(sessionId: string, cwd?: string): { sessionId: string } {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (cwd) existing.cwd = cwd;
      return { sessionId };
    }
    this.sessions.set(sessionId, { sessionId, cwd: cwd ?? this.defaultCwd, modeId: "default" } as unknown as Session);
    return { sessionId };
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Switch the session's operating mode; echoes a current_mode_update. */
  setMode(sessionId: string, modeId: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.modeId = modeId;
    this.sink.update(sessionId, { sessionUpdate: "current_mode_update", modeId });
    return true;
  }

  /** Cancel the in-flight prompt for a session (best-effort; no-op if idle). */
  cancel(sessionId: string): void {
    this.sessions.get(sessionId)?.abort?.abort();
  }

  /**
   * Run one prompt turn: stamp a fresh AbortController, stream the runner's
   * events out as `session/update`s, route approvals through the sink, and return
   * the stopReason. An aborted turn resolves `cancelled`, never throws.
   */
  async prompt(sessionId: string, prompt: string): Promise<{ stopReason: StopReason }> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session: ${sessionId}`);
    const abort = new AbortController();
    s.abort = abort;
    const emit = (event: StreamEvent): void => {
      const update = eventToUpdate(event);
      if (update) this.sink.update(sessionId, update);
    };
    const approve = (action: string, reason: string, toolName?: string): Promise<boolean> =>
      this.sink.requestPermission(sessionId, {
        toolCall: { toolCallId: toolName ? toolId(toolName) : "approval", title: reason || action },
        options: PERMISSION_OPTIONS,
      });
    try {
      const { stopReason } = await this.runner({ sessionId, prompt, signal: abort.signal, emit, approve });
      return { stopReason: abort.signal.aborted ? "cancelled" : stopReason };
    } catch (err) {
      if (abort.signal.aborted) return { stopReason: "cancelled" };
      throw err;
    } finally {
      s.abort = undefined;
    }
  }
}
