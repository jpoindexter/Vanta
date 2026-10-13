import { createHash } from "node:crypto";
import type { EffectGateContext } from "../effects/execute-effect.js";
import { matchRule, tighten, type PermRule } from "../permissions/rules.js";
import type { ApprovalDetail } from "../permissions/request.js";
import { redactSecrets } from "../store/secret-scan.js";
import { APPROVAL_TOOL_NAME, PROMPT_PREVIEW_CHARS } from "./constants.js";
import type { AccessMode } from "./types.js";

// The launch gate for an external agent CLI. Same layers as the call_agent
// tool: kernel assess, project-scoped saved rules, an exact-action approval
// card, then the effect gate inside runExternalAgent. It never skips the card
// unless the owner saved an "Always" rule for this project (and the CLI does
// not approve its own actions).

export type LaunchRequest = {
  runtimeId: string;
  displayName: string;
  command: string;
  cwd: string;
  ticketId: string;
  prompt: string;
  access: AccessMode;
  selfApproving: boolean;
};

export type LaunchDecision = { ok: true; effectGate?: EffectGateContext } | { ok: false; error: string };

export type LaunchGate = { authorize: (request: LaunchRequest) => Promise<LaunchDecision> };

export type GateDeps = {
  assess: (action: string) => Promise<{ risk: "allow" | "ask" | "block"; reason?: string }>;
  loadRules: () => Promise<PermRule[]>;
  /** Absent in headless hosts: an approval that is needed is then refused, never assumed. */
  requestApproval?: (action: string, reason: string, toolName: string, detail: ApprovalDetail) => Promise<boolean>;
  effectGate?: EffectGateContext;
  projectRoot: string;
};

export const promptSha = (prompt: string): string => createHash("sha256").update(prompt).digest("hex");

/** One line the owner approves: which CLI, where it runs, what it was told, with what access. */
export function launchAction(request: LaunchRequest): string {
  const preview = redactSecrets(request.prompt).replace(/\s+/g, " ").slice(0, 160);
  const access = request.selfApproving ? "unrestricted (self-approving)" : request.access;
  return `launch ${request.displayName} (${request.command}) as a worker on ticket ${request.ticketId} in ${request.cwd} with ${access} access: "${preview}" [prompt sha256:${promptSha(request.prompt).slice(0, 12)}]`;
}

function reasonFor(request: LaunchRequest): string {
  const can = request.selfApproving ? "act without asking" : request.access === "edit" ? "edit files there" : "read files there";
  const base = `Runs the ${request.displayName} CLI, an autonomous agent, in ${request.cwd}. It can ${can}; its work is recorded on the ticket.`;
  return request.selfApproving ? `${base} This CLI approves its own actions, so you cannot review its individual steps. Approval applies to this launch only.` : base;
}

async function verdictFor(deps: GateDeps, action: string): Promise<{ risk: "allow" | "ask" | "block"; reason?: string } | { error: string }> {
  try {
    return await deps.assess(action);
  } catch (error) {
    return { error: `blocked: safety kernel unreachable (${error instanceof Error ? error.message : String(error)}). Restart Vanta to relaunch it.` };
  }
}

export async function authorizeLaunch(deps: GateDeps, request: LaunchRequest): Promise<LaunchDecision> {
  const action = launchAction(request);
  const verdict = await verdictFor(deps, action);
  if ("error" in verdict) return { ok: false, error: verdict.error };
  const rule = matchRule(await deps.loadRules(), APPROVAL_TOOL_NAME, action, deps.projectRoot);
  const decision = tighten(verdict.risk, rule);
  if (decision === "block") return { ok: false, error: `blocked: ${verdict.risk === "block" ? verdict.reason ?? "kernel block" : "a saved Never rule covers launching agents in this project"}` };
  const savedAllow = rule === "allow" && !request.selfApproving;
  if (!savedAllow) {
    if (!deps.requestApproval) return { ok: false, error: `${request.displayName} needs the owner's approval to launch and no approval channel is open. Run it from the desktop, or save an Always rule for call_agent in this project.` };
    const preview = redactSecrets(request.prompt).slice(0, PROMPT_PREVIEW_CHARS);
    const approved = await deps.requestApproval(action, reasonFor(request), APPROVAL_TOOL_NAME, { diff: preview, ...(request.selfApproving ? { canRemember: false } : {}) });
    if (!approved) return { ok: false, error: `the owner declined to launch ${request.displayName} for ${request.ticketId}` };
  }
  return { ok: true, effectGate: deps.effectGate };
}

export const createLaunchGate = (deps: GateDeps): LaunchGate => ({ authorize: (request) => authorizeLaunch(deps, request) });
