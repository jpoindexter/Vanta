import type { KernelClient } from "../kernel/client.js";
import type { ToolSchema } from "../providers/interface.js";
import type { DiffLine } from "../util/diff.js";
import type { ContextInspection } from "./inspect-context.js";

export type { DiffLine };

export type ToolResult = { ok: boolean; output: string; diff?: DiffLine[] };

export type ToolContext = {
  root: string;
  /** Current conversation/session id, when a host has one. Used for durable sidecar metadata. */
  sessionId?: string;
  safety: KernelClient;
  /** Pause and ask the human y/n. Returns true if approved. toolName lets the
   *  host key session/always-allow and accept-edits auto-approve decisions. */
  requestApproval: (action: string, reason: string, toolName?: string, detail?: { diff?: string }) => Promise<boolean>;
  /** Surface incremental progress mid-execution (a long tool can stream a line or
   *  heartbeat to the transcript before it returns). Wired to the StreamEvent
   *  `note` surface by the dispatcher; absent in non-streaming contexts. */
  onProgress?: (text: string) => void;
  /** Read-only live prompt/tool-schema measurements for inspect_context. */
  inspectContext?: () => ContextInspection;
};

export type Tool = {
  schema: ToolSchema;
  /**
   * The safety-relevant description of this call (e.g. the path or command,
   * not file content). Defaults to name + args if omitted.
   */
  describeForSafety?: (args: Record<string, unknown>) => string;
  /**
   * EXT-ACP-EDIT-DIFF — an old/new preview of the mutation this call would
   * make, computed BEFORE approval and attached to the permission ask (file
   * tools implement it; hosts that render diffs surface it). Undefined = no
   * preview. Must never throw; must not mutate anything.
   */
  describeDiff?: (args: Record<string, unknown>, root: string) => Promise<string | undefined>;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
};
