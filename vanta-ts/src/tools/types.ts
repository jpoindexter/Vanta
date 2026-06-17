import type { KernelClient } from "../kernel/client.js";
import type { ToolSchema } from "../providers/interface.js";
import type { DiffLine } from "../util/diff.js";

export type { DiffLine };

export type ToolResult = { ok: boolean; output: string; diff?: DiffLine[] };

export type ToolContext = {
  root: string;
  safety: KernelClient;
  /** Pause and ask the human y/n. Returns true if approved. toolName lets the
   *  host key session/always-allow and accept-edits auto-approve decisions. */
  requestApproval: (action: string, reason: string, toolName?: string) => Promise<boolean>;
};

export type Tool = {
  schema: ToolSchema;
  /**
   * The safety-relevant description of this call (e.g. the path or command,
   * not file content). Defaults to name + args if omitted.
   */
  describeForSafety?: (args: Record<string, unknown>) => string;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<ToolResult>;
};
