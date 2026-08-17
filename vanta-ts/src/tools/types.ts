import type { KernelClient } from "../kernel/client.js";
import type { ToolSchema } from "../providers/interface.js";
import type { DiffLine } from "../util/diff.js";
import type { ToolCall } from "../types.js";
import type { ContextInspection } from "./inspect-context.js";
import type { PermissionMode } from "../modes/permission-mode.js";
import type { AskQuestion, AskUserResponse } from "./ask-user-model.js";
import type { ReceiptDisposition } from "../work-items/contract.js";

export type { DiffLine };

export type ToolResult = {
  ok: boolean;
  output: string;
  diff?: DiffLine[];
  /** Explicit effect truth. Omitted mutators fail conservatively toward unknown. */
  effectDisposition?: ReceiptDisposition;
  /** Only executed readback/proof may set verified. Success alone stays unverified. */
  verification?: { status: "unverified" | "verified"; evidence?: string };
};

export type EffectAuthority = {
  /** Exact host operation authorized by the one outer policy boundary. */
  operationId: string;
  /** Turn/session scope prevents authority reuse by another host lifecycle. */
  scopeId: string;
  /** SHA-256 over kind, target class, action, and payload hash. */
  descriptorSha256: string;
  /** Exact outer action, when policy allows inner compatibility consumption. */
  action?: string;
  consumeExactApproval?: boolean;
  /** Explicit central-gateway capability for a different child effect. */
  authorizeChild?: (intent: {
    action: string;
    kind: string;
    targetClass: string;
    payloadSha256: string;
  }) => Promise<"allowed" | "blocked" | "denied">;
};

export type ToolContext = {
  root: string;
  /** Current conversation/session id, when a host has one. Used for durable sidecar metadata. */
  sessionId?: string;
  /** Stable provider tool-call id for one model-requested operation. */
  effectCallId?: string;
  /** Stable scope for claim keys when a host has no persisted session id. */
  effectScopeId?: string;
  /** In-memory authority consumed only by matching inner compatibility adapters. */
  effectAuthority?: EffectAuthority;
  /** Exact call whose pending/started/settled journal is owned by the outer host. */
  effectJournalOwnerId?: string;
  /** Exact action already authorized by the outer dispatcher for this call.
   * The effect gateway may consume it once instead of prompting twice. */
  effectApprovalAction?: string;
  /** Whether an exact matching inner confirmation may consume that decision. */
  effectApprovalReusable?: boolean;
  safety: KernelClient;
  /** Pause and ask the human y/n. Returns true if approved. toolName lets the
   *  host key session/always-allow and accept-edits auto-approve decisions. */
  requestApproval: (action: string, reason: string, toolName?: string, detail?: { diff?: string; fresh?: boolean }) => Promise<boolean>;
  /** Pause an interactive host for a structured operator-owned decision. Hosts
   * without a picker omit this and the tool falls back to a formatted prompt. */
  requestQuestion?: (questions: AskQuestion[]) => Promise<AskUserResponse>;
  /** Host-owned live permission mode. Desktop uses this instead of mutating the
   * process-wide mode when the operator changes a project setting. */
  permissionMode?: () => PermissionMode;
  /** Writable directories granted for this one approved tool execution. The
   * OS sandbox receives these as additional bindings; they are never persisted. */
  sandboxWritableDirs?: readonly string[];
  /** Surface incremental progress mid-execution (a long tool can stream a line or
   *  heartbeat to the transcript before it returns). Wired to the StreamEvent
   *  `note` surface by the dispatcher; absent in non-streaming contexts. */
  onProgress?: (text: string) => void;
  /** Internal lifecycle hook fired after every pre-execution gate and immediately before tool code. */
  onToolExecutionStart?: (call: ToolCall) => Promise<void>;
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
