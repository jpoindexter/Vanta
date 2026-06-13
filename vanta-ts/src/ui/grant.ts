import { addRule } from "../permissions/store.js";

/**
 * "Always allow" a tool from the approval prompt: persist an allow rule so the
 * dispatch gate (applySafetyGate → tighten) auto-confirms future kernel `ask`
 * verdicts for it. tighten() keeps any kernel `block` immovable, so this only
 * ever silences asks, never a hard block. Scoped to the tool name — the same
 * granularity as Claude Code's "don't ask again for <tool>".
 *
 * Best-effort and fire-and-forget: the user already approved this call, so a
 * write failure must not abort the turn. No-op without a tool name.
 */
export async function grantAlways(
  toolName: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!toolName) return;
  await addRule({ action: "allow", tool: toolName }, env);
}
