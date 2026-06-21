import type { Risk } from "../types.js";

// AUTO-MODE-OPTIN — the one-time opt-in gate in front of "auto" permission mode
// (the ML/classifier mode that auto-approves the read-only/safe slice of the
// kernel `ask` tier — see permissions/auto-mode.ts). Turning auto mode on must
// be a knowing choice, so the operator sees exactly what auto-approves vs what
// still prompts before it activates. This module is PURE: it builds the opt-in
// explanation, checks a simple affirmative confirmation, and resolves whether
// auto mode actually activates.
//
// LIGHTER than bypass-dialog.ts (its dangerous sibling): auto is far safer, so
// the confirm is a plain "y"/"yes"/"enable" — NOT a typed token. Auto only skips
// the prompt for the classifier's safe set; bypass skips the prompt for the WHOLE
// ask tier with no exceptions.
//
// CRITICAL INVARIANTS (enforced + tested here):
//   1. No opt-in → auto mode OFF. `resolveAutoModeActivation` requires BOTH the
//      request AND the opt-in; either missing → false (the current default).
//   2. The kernel `block` floor is IMMOVABLE — `autoModeMayAutoApprove("block", …)`
//      is ALWAYS false. Auto mode can never lift a Block, by construction.
//   3. Auto only auto-approves the classifier's SAFE set — a risky/destructive
//      `ask` action the classifier flags unsafe still PROMPTS (returns false).

/**
 * The accepted affirmative confirmations (lower-cased). A bare "y"/"yes" works
 * here — unlike bypass, which demands an exact typed token — because auto mode
 * is the lighter, safer sibling and a simple confirm is proportionate.
 */
export const AUTO_MODE_AFFIRMATIVES = ["y", "yes", "enable"] as const;

/**
 * The one-time opt-in explanation shown before auto mode can be enabled. Pure —
 * it spells out what auto-approves (the classifier's safe read-only set), what
 * STILL prompts (writes / destructive / out-of-scope), reaffirms that the kernel
 * `block` floor is untouched, and tells the operator how to confirm or disable.
 */
export function buildAutoModeExplanation(): string {
  return [
    "AUTO PERMISSION MODE — one-time opt-in",
    "",
    "Auto mode lets the classifier AUTO-APPROVE only the safe, read-only slice of",
    "the `ask` tier — file reads, searches, file discovery, state inspection — so",
    "you are not asked before each harmless read.",
    "",
    "What STILL PROMPTS (auto never auto-approves these):",
    "  • file writes and edits",
    "  • destructive or irreversible actions",
    "  • out-of-scope access (outside the project root)",
    "  • anything the classifier flags as unsafe (e.g. pipe-to-shell, secrets)",
    "",
    "The kernel `block` floor is UNTOUCHED: a Block is NEVER auto-approved, even",
    "in auto mode. Auto only skips the prompt for the classifier's safe set.",
    "",
    "To enable, confirm with: y / yes / enable",
    'Anything else (including "n" or empty input) leaves auto mode OFF.',
    "To turn it back off later, disable auto mode in your permission settings.",
  ].join("\n");
}

/**
 * True when the answer is a simple affirmative (case-insensitive, trimmed):
 * "y", "yes", or "enable". A bare "n", an empty string, or anything else → false.
 * Pure. Lighter than bypass's exact-token gate — a reflexive "y" is enough,
 * because auto mode is far less dangerous than bypass.
 */
export function isAutoModeOptedIn(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return (AUTO_MODE_AFFIRMATIVES as readonly string[]).includes(normalized);
}

/**
 * Resolve whether auto mode actually activates. Auto activates ONLY when it was
 * BOTH requested (e.g. via a flag / mode switch) AND explicitly opted into via
 * `isAutoModeOptedIn`. Either missing → false (auto stays OFF, the default).
 * Pure — this is the gating decision the mode switch checks before flipping the
 * live permission mode.
 */
export function resolveAutoModeActivation(requested: boolean, optedIn: boolean): boolean {
  return requested && optedIn;
}

/**
 * Whether auto mode may auto-approve an action of the given kernel risk. Pure.
 *
 *   - "block" → FALSE (the IMMOVABLE floor — a Block is NEVER auto-approved)
 *   - "ask"   → only when `classifierSaysSafe` is true (the classifier's safe
 *               read-only set). A risky/unsafe `ask` → false (it still PROMPTS).
 *   - "allow" → true (already allowed by the kernel; nothing to gate)
 *
 * The two `false` branches are the security invariant: auto mode cannot lift a
 * kernel Block, and cannot auto-approve an `ask` the classifier flags unsafe.
 */
export function autoModeMayAutoApprove(risk: Risk, classifierSaysSafe: boolean): boolean {
  if (risk === "block") return false;
  if (risk === "ask") return classifierSaysSafe;
  return true;
}
