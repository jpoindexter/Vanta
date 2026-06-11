import type { LLMProvider } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Message, ImageAttachment } from "../types.js";
import type { DiffLine } from "../util/diff.js";
import type { Summarizer } from "../context.js";
import type { HookBus } from "../plugins/hooks.js";

export type AgentDeps = {
  provider: LLMProvider;
  safety: SafetyClient;
  registry: ToolRegistry;
  root: string;
  /** Ask the human to approve a gated action. `toolName` lets the host key an
   * allowlist ("always allow this tool"); omitted by tool-internal callers. */
  requestApproval: (action: string, reason: string, toolName?: string) => Promise<boolean>;
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
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, ok: boolean, output: string, diff?: DiffLine[]) => void;
  maxIterations?: number;
  summarize?: Summarizer;
  /** When set, a goal-reminder note is re-injected after context compression. */
  activeGoalText?: string;
  /** The live session scratchpad, re-injected on compaction. Hosts refresh it
   * post-turn via Conversation.setSessionMemory. */
  sessionMemory?: string;
  /** Called when consecutive tool failures hit the threshold; fire a note or interrupt. */
  onIterationCheck?: (consecutiveFailures: number) => void;
  /** Called when a compression round runs, with the dropped count and summary. */
  onAutoCompact?: (dropped: number, summary: string) => void;
  /** Abort the run between iterations (Ctrl+C, gateway shutdown, caller cancel). */
  signal?: AbortSignal;
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
};

export type StoppedReason = "done" | "max_iterations" | "repeated_failure" | "interrupted";

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
