import type { LLMProvider } from "../providers/interface.js";
import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { EffortLevel, Message, ImageAttachment } from "../types.js";
import type { DiffLine } from "../util/diff.js";
import type { Summarizer } from "../context.js";
import type { HookBus } from "../plugins/hooks.js";
import type { SessionWorkingMemory } from "../memory/working.js";

export type AgentDeps = {
  provider: LLMProvider;
  safety: KernelClient;
  registry: ToolRegistry;
  root: string;
  /** Current conversation/session id, when the host has one. */
  sessionId?: string;
  /** Ask the human to approve a gated action. `toolName` lets the host key an
   * allowlist ("always allow this tool"); omitted by tool-internal callers. */
  requestApproval: (action: string, reason: string, toolName?: string, detail?: { diff?: string }) => Promise<boolean>;
  onText?: (text: string) => void;
  /** Extended thinking / reasoning text returned by the provider (e.g. Anthropic
   * extended thinking). Called once per turn when the provider returns thinking. */
  onThinking?: (text: string) => void;
  /** UX-STREAM: typed event emitter — a superset of the individual callbacks above.
   * Surfaces emit both the typed event AND the legacy callback so existing surfaces
   * continue to work; new surfaces can subscribe only to onEvent. */
  onEvent?: (event: StreamEvent) => void;
  /** Live token deltas as the model streams. When set (and the provider supports
   * streaming), the loop streams instead of waiting for the full completion. */
  onTextDelta?: (delta: string) => void;
  /** Live reasoning/thinking deltas as the model streams them (DeepSeek-R1 `reasoning_content`,
   *  OpenRouter `reasoning`, Anthropic thinking). Transient — for a live "thinking" display, not
   *  committed output. No-op for backends that hide reasoning (e.g. codex), so it's universal. */
  onThinkingDelta?: (delta: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, ok: boolean, output: string, diff?: DiffLine[]) => void;
  maxIterations?: number;
  summarize?: Summarizer;
  /** When set, a goal-reminder note is re-injected after context compression. */
  activeGoalText?: string;
  /** Per-turn model effort, read live so /effort changes apply next call. */
  getEffortLevel?: () => EffortLevel;
  /** The live session scratchpad, re-injected on compaction. Hosts refresh it
   * post-turn via Conversation.setSessionMemory. */
  sessionMemory?: string;
  /** Hot working set for files edited in compacted-away turns. */
  workingMemory?: SessionWorkingMemory;
  /** Called when consecutive tool failures hit the threshold; fire a note or interrupt. */
  onIterationCheck?: (consecutiveFailures: number) => void;
  /** Called when a compression round runs, with the dropped count and summary. */
  onAutoCompact?: (dropped: number, summary: string) => void;
  /** Called while an automatic compaction pass is actively summarizing context. */
  onCompacting?: (active: boolean) => void;
  /** Abort the run between iterations (Ctrl+C, gateway shutdown, caller cancel). */
  signal?: AbortSignal;
  /** SDK/non-interactive structured output schema. Adds the StructuredOutput synthetic tool. */
  outputSchema?: Record<string, unknown>;
  /** Optional stronger read-only provider to consult after repeated tool failures (VANTA_ADVISOR_MODEL). */
  advisorProvider?: LLMProvider;
  /**
   * Plan mode: when this returns true, only read-only tools are allowed.
   * Write/shell tools return a "blocked: plan mode" result without executing.
   * Set by the interactive host when /planmode is on and the plan is not yet approved.
   */
  planGate?: () => boolean;
  /** MessageDisplay hook bus — transforms/suppresses assistant text before it is
   * shown. Defaults to the global bus; tests pass a fresh one. The transcript
   * keeps the raw text either way, so tools and the model are unaffected. */
  hooks?: HookBus;
  /**
   * VANTA-STOP-CMD: graceful soft-stop predicate. Checked at the post-tool-call
   * boundary — when it returns true, the loop lets the in-flight tool batch
   * finish, then ends the turn cleanly (`stoppedReason: "soft_stopped"`) with a
   * completed-work summary, instead of starting the next iteration. Absent or
   * false → byte-identical loop behaviour. Set by the `/stop` handler.
   */
  shouldSoftStop?: () => boolean;
};

export type StoppedReason = "done" | "max_iterations" | "repeated_failure" | "interrupted" | "soft_stopped";

/**
 * UX-STREAM: Typed stream-event vocabulary — names what happened so each
 * surface (TUI / REPL / webhook / voice) can render or suppress per its
 * capability without pattern-matching raw strings.
 */
export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "text_complete"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; output: string }
  | { type: "note"; text: string }
  | { type: "turn_end"; finalText: string; usage?: { inputTokens: number; outputTokens: number } };

export type AgentOutcome = {
  finalText: string;
  iterations: number;
  stoppedReason: StoppedReason;
  /** Total tool calls executed this turn — drives the post-turn self-improvement nudge. */
  toolIterations: number;
  /** Real token usage summed across the turn's provider calls, when reported. */
  usage?: { inputTokens: number; outputTokens: number };
  /** Tokens saved by native compression this turn. */
  tokensSaved?: number;
  /** Validated StructuredOutput arguments when outputSchema is active. */
  structuredResult?: unknown;
};

/** A stateful multi-turn conversation that retains history across `send` calls. */
export type Conversation = {
  /** The live transcript (system first). Read-only in spirit; the loop mutates it. */
  messages: Message[];
  /** Send a user turn (optionally with attached images); runs the loop, keeps history. */
  send: (userText: string, images?: ImageAttachment[], signal?: AbortSignal) => Promise<AgentOutcome>;
  /**
   * Hot-swap the model mid-conversation (the /model picker). Reassigns the
   * provider the loop reads each turn; pass a matching summarizer so context
   * compression stays on the new model. History is preserved. Switch only
   * between turns — never mid-flight.
   */
  setProvider: (provider: LLMProvider, summarize?: Summarizer) => void;
  /** Refresh the live scratchpad injected on compaction. */
  setSessionMemory: (text: string) => void;
};
