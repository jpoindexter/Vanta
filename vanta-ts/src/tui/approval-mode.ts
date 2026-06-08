export const APPROVAL_MODES = ["review", "accept-edits", "auto"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/**
 * Cycle to the next approval mode. Pure — safe to test without React.
 * review → accept-edits → auto → review
 */
export function nextMode(current: ApprovalMode): ApprovalMode {
  const idx = APPROVAL_MODES.indexOf(current);
  return APPROVAL_MODES[(idx + 1) % APPROVAL_MODES.length]!;
}

export const MODE_LABEL: Record<ApprovalMode, string> = {
  review: "review",
  "accept-edits": "accept-edits",
  auto: "auto",
};
