import type { ToolContext } from "../tools/types.js";
import { sameEffectAction } from "./action-identity.js";
import type { EffectIntent } from "./execute-effect.js";

export async function authorizeInnerAction(
  ctx: ToolContext,
  authority: NonNullable<ToolContext["effectAuthority"]>,
  request: { action: string; reason: string; toolName?: string; detail?: { diff?: string; fresh?: boolean } },
): Promise<boolean> {
  const { action, reason, toolName, detail } = request;
  const routine = !detail?.fresh && sameEffectAction(authority.action, action);
  if (authority.consumeExactApproval && routine) return true;
  let verdict: Awaited<ReturnType<ToolContext["safety"]["assess"]>>;
  try {
    verdict = await ctx.safety.assess(action);
  } catch {
    return false;
  }
  if (verdict.risk === "block") return false;
  return ctx.requestApproval(
    action,
    reason,
    toolName,
    { ...detail, fresh: !routine },
  );
}

export async function authorizeChildEffect(
  ctx: ToolContext,
  intent: Pick<EffectIntent, "action" | "kind" | "targetClass" | "payloadSha256">,
): Promise<"allowed" | "blocked" | "denied"> {
  let verdict: Awaited<ReturnType<ToolContext["safety"]["assess"]>>;
  try {
    verdict = await ctx.safety.assess(intent.action);
  } catch {
    return "blocked";
  }
  if (verdict.risk === "block") return "blocked";
  if (verdict.risk === "allow") return "allowed";
  const approved = await ctx.requestApproval(
    intent.action,
    verdict.reason || "child effect requires approval",
    undefined,
    { fresh: true },
  );
  return approved ? "allowed" : "denied";
}
