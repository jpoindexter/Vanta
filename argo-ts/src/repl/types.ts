import type { Conversation } from "../agent.js";
import type { ImageAttachment } from "../types.js";
import type { RunSetup } from "../session.js";

/** Mutable per-session REPL state that some commands change (/clear, /resume, /title, /fork, /image). */
export type ReplState = {
  sessionId: string;
  started: string;
  turnIndex: number;
  title?: string;
  /** Images attached via /image or /paste, consumed by the next user turn. */
  pendingImages?: ImageAttachment[];
};

export type ReplCtx = {
  convo: Conversation;
  setup: RunSetup;
  dataDir: string;
  state: ReplState;
  env: NodeJS.ProcessEnv;
  now: () => Date;
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
};

/** One slash-command handler. `arg` is the text after the command word. */
export type SlashHandler = (arg: string, ctx: ReplCtx) => Promise<SlashResult> | SlashResult;
