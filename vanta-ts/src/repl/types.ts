import type { Conversation } from "../agent.js";
import type { EffortLevel, ImageAttachment } from "../types.js";
import type { RunSetup } from "../session.js";
import type { SessionWorkingMemory } from "../memory/working.js";
import type { LLMProvider } from "../providers/interface.js";
import type { SessionCost } from "../pricing.js";

/** Mutable per-session REPL state that some commands change (/clear, /resume, /title, /fork, /image). */
export type ReplState = {
  sessionId: string;
  started: string;
  turnIndex: number;
  title?: string;
  /** Images attached via /image or /paste, consumed by the next user turn. */
  pendingImages?: ImageAttachment[];
  /** COST-VISIBLE: running session cost split (local free vs frontier metered). */
  sessionCost?: SessionCost;
  /** Current session model-effort setting; /effort mutates it live. */
  effortLevel?: EffortLevel;
  /**
   * The goal the session is actively working toward — the footer's ◇ line reads
   * this, not the kernel ledger. A carried goal launches PAUSED (null here) so it
   * doesn't show as active until /goal resume; /goal set|resume sets it, drop clears.
   */
  activeGoal?: string | null;
  /**
   * Plan-mode approval flag: true after the user runs /planmode approve.
   * Reset to false whenever /planmode is toggled or the session clears.
   */
  planApproved?: boolean;
  /** ND-TIME-RANGES — ISO timestamp of the last completed turn; powers `/time`'s
   *  "since last action". Stamped post-turn; absent until the first turn ends. */
  lastActionAt?: string;
};

export type ReplCtx = {
  convo: Conversation;
  setup: RunSetup;
  dataDir: string;
  state: ReplState;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  /** Session working memory — available in the REPL; may be absent in TUI buildCtx. */
  workingMemory?: SessionWorkingMemory;
};

/** Outcome of a slash command: text to show plus control signals for the host. */
export type SlashResult = {
  output?: string;
  exit?: boolean;
  cleared?: boolean;
  resumed?: boolean;
  unknown?: boolean;
  /** Text the host should send to the agent as a fresh turn (drives /retry). */
  resend?: string;
  /** Compact display label for the TUI transcript when resend carries injected context (e.g. a skill body). */
  resendDisplay?: string;
  /** A hot-swapped provider (drives /model <arg>) so the TUI banner refreshes. */
  provider?: LLMProvider;
  /** Reload the instance in place (drives /restart) — host exits with code 75. */
  restart?: boolean;
  /** Pre-fill the composer/readline with this text for inline editing. */
  loadIntoComposer?: string;
  /** Index of the conversation message that loadIntoComposer came from. */
  editMessageIndex?: number;
  /** Toggle focus view (hide tool entries; show only user + final assistant turns). */
  toggleFocusMode?: true;
  /** Composer anchor (drives /composer) so the host repositions the input live. */
  composerAnchor?: "float" | "bottom";
  /** Composer vi-mode on/off (drives /vim) so the TUI toggles the composer live. */
  vimMode?: boolean;
};

/** One slash-command handler. `arg` is the text after the command word. */
export type SlashHandler = (arg: string, ctx: ReplCtx) => Promise<SlashResult> | SlashResult;
