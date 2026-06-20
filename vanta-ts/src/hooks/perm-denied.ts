// PermissionDenied hook payload + fire-decision (pure).
//
// When the auto-mode permission classifier (or a soft-deny rule) DENIES a tool
// action, a `PermissionDenied` hook event fires with the denied action context.
// Both the payload build and the fire decision are pure so they can be
// unit-tested in isolation; the live fire site (agent/dispatch-helpers.ts)
// injects `fireHooks`. With no PermissionDenied hook configured, firing is a
// no-op — so this changes nothing unless an operator opts in.

/** A permission decision as produced by the layered classifier chain. */
export type PermissionDecision = { decision: "allow" | "ask" | "block"; reason?: string };

/** The context object delivered to a `PermissionDenied` hook. */
export type PermDeniedPayload = {
  /** The tool whose action was denied. */
  tool: string;
  /** The safety-relevant descriptor that was assessed (path/command, not content). */
  action: string;
  /** Why it was denied (kernel block reason / auto-mode soft-deny reason). */
  reason: string;
};

/**
 * Build the `PermissionDenied` hook context. Pure: no side effects, no env.
 * Shape matches the inline `{ tool, action, reason }` already fired at the
 * user-deny site, so an operator's existing PermissionDenied hooks see one
 * consistent payload regardless of which deny path triggered.
 */
export function buildPermDeniedPayload(toolName: string, reason: string, descriptor: string): PermDeniedPayload {
  return { tool: toolName, action: descriptor, reason };
}

/**
 * Fire the PermissionDenied hook only on a DENY verdict. A `block` decision is
 * the auto-mode classifier / soft-deny rule denial; `allow` and `ask` are not
 * denials and must not fire it.
 */
export function shouldFirePermDenied(decision: PermissionDecision): boolean {
  return decision.decision === "block";
}
