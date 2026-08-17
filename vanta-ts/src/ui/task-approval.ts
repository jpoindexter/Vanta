import { classifyBashSafety } from "../permissions/bash-classifier.js";

export type ApprovalScopeInput = {
  action: string;
  reason: string;
  toolName?: string;
  fresh?: boolean;
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

/** A task grant is available only for repeatable, reversible work. */
export function canContinueTask(input: ApprovalScopeInput): boolean {
  if (input.fresh || !input.toolName || ONE_WAY.test(`${input.action}\n${input.reason}`)) return false;
  if (/^overwrite existing file\s+/i.test(input.action)) {
    const path = input.action.replace(/^overwrite existing file\s+/i, "").trim();
    if (input.toolName !== "write_file" || !path || path.startsWith("/") || path.startsWith("~") || path.split(/[\\/]/).includes("..") || SENSITIVE_WRITE.test(path)) return false;
  }
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
