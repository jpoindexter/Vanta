import type { SafetyClient } from "../safety-client.js";
import type { ToolSchema } from "../providers/interface.js";

export type ToolResult = { ok: boolean; output: string };

export type ToolContext = {
  root: string;
  safety: SafetyClient;
  /** Pause and ask the human y/n. Returns true if approved. */
  requestApproval: (action: string, reason: string) => Promise<boolean>;
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
