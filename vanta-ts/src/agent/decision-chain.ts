import type { ToolContext } from "../tools/types.js";
import type { ToolCall, Verdict } from "../types.js";
import { tighten, matchRule } from "../permissions/rules.js";
import { loadRules } from "../permissions/store.js";
import { classifyAutoModeAction, isAutoModeEnabled, resolveAutoModeConfig } from "../permissions/auto-mode.js";
import { classifyTighten, classifierEnabled } from "../permissions/auto-classifier.js";
import { bashClassifierEnabled } from "../permissions/bash-classifier.js";
import { classifyBashSafetyAsync } from "../permissions/bash-tree-sitter.js";
import { loadSettings } from "../settings/store.js";
import { approvalPreferenceFor, loadOperatorProfile } from "../operator-profile/profile.js";

/** A resolved permission decision over the kernel verdict. */
export type Decision = { decision: "allow" | "ask" | "block"; reason: string };

/**
 * The tightening chain over the kernel verdict: rules → auto-mode → bash-classifier
 * → operator-profile → advisory classifier. The kernel verdict is the floor; every
 * stage may TIGHTEN (escalate to ask/block) but NEVER loosen a kernel block.
 */
export async function resolveLayeredDecision(
  verdict: Verdict,
  call: ToolCall,
  action: string,
  ctx: ToolContext,
): Promise<Decision> {
  const ruleDecision = tighten(verdict.risk, matchRule(await loadRules(process.env), call.name, action));
  const autoDecision = await applyAutoMode(ruleDecision, call.name, action, ctx);
  const bashDecision = await applyBashClassifier(autoDecision, call);
  const profileDecision = await applyOperatorProfile(bashDecision, verdict.risk, call.name, action);
  return applyAdvisoryClassifier(profileDecision, call.name, action);
}

async function applyOperatorProfile(
  current: Decision,
  kernelRisk: "allow" | "ask" | "block",
  toolName: string,
  action: string,
): Promise<Decision> {
  if (current.decision === "block") return current;
  const profile = await loadOperatorProfile(process.env).catch(() => null);
  if (!profile) return current;
  const next = approvalPreferenceFor(profile, { toolName, action, currentDecision: current.decision, kernelRisk });
  return next.decision === current.decision ? current : next;
}

/** VANTA-BASH-CLASSIFIER: loosen a kernel/auto-mode ASK to allow ONLY for a
 * shell_cmd whose command is classified clearly-safe (read-only/idempotent), and
 * ONLY when armed. Never touches a block/allow — the kernel block floor stands,
 * and the downstream tighteners can still re-escalate. Off by default. */
async function applyBashClassifier(current: Decision, call: ToolCall): Promise<Decision> {
  if (current.decision !== "ask" || call.name !== "shell_cmd" || !bashClassifierEnabled(process.env)) return current;
  // Classify the REAL command (call.arguments.command), not the describeForSafety
  // string — "run shell command: <cmd>" would always classify as unknown (dead).
  const command = typeof call.arguments.command === "string" ? call.arguments.command : "";
  return await classifyBashSafetyAsync(command) === "safe"
    ? { decision: "allow", reason: "bash-classifier: safe read-only command auto-approved" }
    : current;
}

/** PAPER-AUTO-CLASSIFIER: final tighten-only advisory pass. Off by default; can
 * only escalate (allow→ask/block), never loosen. A kernel block already short-
 * circuits upstream, so this only ever sees allow/ask. */
function applyAdvisoryClassifier(current: Decision, toolName: string, action: string): Decision {
  if (current.decision === "block" || !classifierEnabled(process.env)) return current;
  const next = classifyTighten({ decision: current.decision, toolName, action });
  return next.decision === current.decision ? current : next;
}

async function applyAutoMode(
  decision: "allow" | "ask" | "block",
  toolName: string,
  descriptor: string,
  ctx: ToolContext,
): Promise<Decision> {
  if (decision === "block") return { decision, reason: "denied by a permission rule" };
  const settings = await loadSettings(ctx.root ?? process.cwd(), process.env);
  if (!isAutoModeEnabled(process.env, settings)) return { decision, reason: "kernel or permission rule" };
  return classifyAutoModeAction({
    kernelRisk: decision,
    toolName,
    descriptor,
    config: resolveAutoModeConfig(settings),
  });
}
