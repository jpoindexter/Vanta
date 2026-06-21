import type { Risk } from "../types.js";

// BYPASS-DIALOG — the EXPLICIT gate in front of "bypass" permission mode, the
// single most dangerous auto-mode (it auto-approves the kernel `ask` tier with
// NO prompt). Entering it must be a deliberate, typed act — never an accident,
// never a stray flag. This module is PURE: it builds the danger warning, checks
// the typed confirmation token, and resolves whether bypass actually activates.
//
// CRITICAL INVARIANT (enforced + tested here, mirrors auto-mode.ts):
//   bypass auto-approves ONLY the kernel `ask` tier. A kernel `block` is the
//   IMMOVABLE floor — `bypassAutoApproves("block")` is ALWAYS false. Bypass can
//   never lift a Block, by construction. No typed confirmation → bypass stays
//   OFF (the current default), because `resolveBypassActivation` requires both
//   the request AND the confirmation.

/**
 * The exact phrase the operator must type to confirm bypass mode. A bare "y" /
 * "yes" must NOT activate it — the operator has to type this specific token, so
 * a reflexive keystroke or an autofilled "yes" can't enter the dangerous mode.
 */
export const BYPASS_CONFIRM_TOKEN = "enable bypass";

/**
 * The danger warning shown before bypass can be entered. Pure — it states what
 * bypass does, reaffirms that the kernel `block` floor still holds (bypass only
 * skips the `ask` prompt), and tells the operator exactly how to confirm.
 */
export function buildBypassWarning(): string {
  return [
    "⚠ DANGER — BYPASS PERMISSIONS MODE",
    "",
    "Bypass mode AUTO-APPROVES every action the kernel rates `ask` — with NO",
    "prompt. You will not be asked before file writes, shell commands, network",
    "calls, or other ask-tier actions run. This is the most permissive mode.",
    "",
    "The kernel `block` floor STILL HOLDS: a Block is NEVER auto-approved, even",
    "in bypass. Bypass only skips the `ask` confirmation — it cannot lift a Block.",
    "",
    `To confirm, type exactly: ${BYPASS_CONFIRM_TOKEN}`,
    "Anything else (including a bare \"y\"/\"yes\" or empty input) leaves bypass OFF.",
  ].join("\n");
}

/**
 * True only when the typed input EQUALS the confirm token (case-insensitive,
 * trimmed). A bare "y"/"yes", an empty string, or a near-miss → false. Pure.
 * This is the typed-token gate: the operator must type the exact phrase.
 */
export function isBypassConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === BYPASS_CONFIRM_TOKEN;
}

/**
 * Resolve whether bypass mode actually activates. Bypass activates ONLY when it
 * was BOTH requested (e.g. via a flag/mode switch) AND explicitly confirmed by
 * the typed token. Either missing → false (bypass stays OFF). Pure — this is the
 * gating decision a caller checks before flipping the live permission mode.
 */
export function resolveBypassActivation(requested: boolean, confirmed: boolean): boolean {
  return requested && confirmed;
}

/**
 * Whether bypass mode auto-approves an action of the given kernel risk. Pure.
 *
 *   - "ask"   → true  (bypass auto-approves the ask tier — the whole point)
 *   - "allow" → true  (already allowed by the kernel; nothing to gate)
 *   - "block" → FALSE (the IMMOVABLE floor — a Block is NEVER auto-approved)
 *
 * The `block === false` branch is the security invariant: even the most
 * permissive mode cannot auto-approve a kernel Block.
 */
export function bypassAutoApproves(risk: Risk): boolean {
  return risk !== "block";
}
