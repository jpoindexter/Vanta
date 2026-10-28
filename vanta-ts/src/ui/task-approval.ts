import { classifyBashSafety } from "../permissions/bash-classifier.js";
import type { ApprovalDetail } from "../permissions/request.js";
import type { Dispatch, SetStateAction } from "react";

export type ApprovalScopeInput = {
  action: string;
  reason: string;
  toolName?: string;
  fresh?: boolean;
  canRemember?: boolean;
};

/** A pending approval, including whether the effective policy permits reuse. */
export type Pending = ApprovalScopeInput & {
  /** Project root a saved "don't ask again" rule is limited to. */
  root?: string;
  canContinueTask?: boolean;
  grantTask?: () => void;
  /** Managed prompt lifetime; stale decisions cannot grant authority. */
  isActive?: () => boolean;
  /** Identity-bound dismissal cannot remove a newer prompt. */
  dismiss?: () => void;
  resolve: (ok: boolean) => void;
};

const REUSABLE_TOOLS = new Set([
  "edit_file",
  "write_file",
  "web_fetch",
  "browser_read",
  "browser_navigate",
  "screenshot",
]);

const ONE_WAY = /\b(?:delete|remove|force|push|publish|deploy|production|migrat|send|email|message|payment|purchase|spend|transfer|credential|secret|token|auth|outside (?:the )?(?:project|root)|system file|sudo)\b/i;
const SENSITIVE_WRITE = /(?:^|[/\\])(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_rsa|id_ed25519|authorized_keys)/i;

function isBlockedOverwrite(input: ApprovalScopeInput): boolean {
  if (!/^overwrite existing file\s+/i.test(input.action)) return false;
  const path = input.action.replace(/^overwrite existing file\s+/i, "").trim();
  return input.toolName !== "write_file" || !path || path.startsWith("/") || path.startsWith("~") || path.split(/[\\/]/).includes("..") || SENSITIVE_WRITE.test(path);
}

/** A task grant is available only for repeatable, reversible work. */
export function canContinueTask(input: ApprovalScopeInput): boolean {
  if (input.canRemember === false) return false;
  if (input.fresh || !input.toolName || ONE_WAY.test(`${input.action}\n${input.reason}`)) return false;
  if (isBlockedOverwrite(input)) return false;
  if (REUSABLE_TOOLS.has(input.toolName)) return true;
  if (input.toolName !== "shell_cmd") return false;
  const command = input.action.replace(/^run shell command:\s*/i, "");
  return classifyBashSafety(command) === "safe";
}

/**
 * In-memory authorization for one agent turn. Every action still reaches the
 * kernel; only a repeat approval prompt for the same eligible tool is skipped.
 */
export class TaskApprovalScope {
  private readonly tools = new Set<string>();

  beginTurn(): void {
    this.tools.clear();
  }

  grant(input: ApprovalScopeInput): boolean {
    if (!canContinueTask(input) || !input.toolName) return false;
    this.tools.add(input.toolName);
    return true;
  }

  allows(input: ApprovalScopeInput): boolean {
    return Boolean(input.toolName && this.tools.has(input.toolName) && canContinueTask(input));
  }
}

export function requestApprovalWithTaskScope(options: {
  taskApprovals: TaskApprovalScope;
  setPending: Dispatch<SetStateAction<Pending | null>>;
  action: string;
  reason: string;
  toolName?: string;
  detail?: ApprovalDetail;
  root?: string;
}): Promise<boolean> {
  const { taskApprovals, setPending, action, reason, toolName, detail, root } = options;
  const input = { action, reason, toolName, fresh: detail?.fresh, canRemember: detail?.canRemember };
  if (detail?.signal?.aborted) return Promise.resolve(false);
  if (taskApprovals.allows(input)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const signal = detail?.signal;
    let settled = false;
    const dismiss = () => setPending(current => current === pending ? null : current);
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve(ok && !signal?.aborted);
    };
    const abort = () => { finish(false); dismiss(); };
    const pending: Pending = {
      ...input, root, canContinueTask: canContinueTask(input), dismiss,
      isActive: () => !settled && !signal?.aborted,
      grantTask: () => { if (pending.isActive!()) taskApprovals.grant(input); },
      resolve: finish,
    };
    signal?.addEventListener("abort", abort, { once: true });
    setPending(pending);
    if (signal?.aborted) abort();
  });
}
