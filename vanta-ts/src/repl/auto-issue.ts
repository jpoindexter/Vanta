import { oneLine } from "./format.js";

// VANTA-AUTO-ISSUE — when a recurring error/bug is worth filing, DRAFT a GitHub
// issue from the failure context and offer to create it after a short
// ESC-cancellable countdown. Outward-facing, so it is OFF by default
// (`VANTA_AUTO_ISSUE=1`), the operator can always ESC to cancel before anything
// is created, and the issue is NEVER created silently. This module is pure: the
// draft builder, the cancel-window state machine, and the `gh issue create`
// argv builder are unit-tested; the live `gh issue create` execution is the
// documented boundary (named below — NOT executed here).
//
// WIRING (not done this round, named for the live wave): `error-detect.ts`'s
// recurring-error signal — `buildErrorDetectText` fires once consecutive tool
// failures cross `DEFAULT_ERRORDETECT_THRESHOLD` (3). At that point the live
// detector would: (1) assemble `IssueContext` from the same context shape `/bug`
// captures (`bug-cmd.ts formatBugRecord`: desc + model + last intent + recent
// tools + git state); (2) call `buildIssueDraft(ctx)`; (3) gate on
// `autoIssueEnabled(env)` (default off → nothing fires); (4) open the
// ESC-cancellable countdown (`tickCancelWindow`/`cancelWindow`, mirroring the
// clarity-gate's end-of-turn pause); (5) ONLY on `fired:true && !cancelled`
// spawn `gh issue create` via `buildGhIssueArgs(draft, repo)` (argv array,
// kernel-gated like `batch.ts`'s `gh pr create`). The gh exec is the boundary —
// off by default, ESC-cancellable, never silent.

/** Default labels applied to an auto-filed issue. */
export const DEFAULT_ISSUE_LABELS: readonly string[] = ["bug", "auto-filed"];

/** Max body length so a runaway failure log can't balloon the issue. */
export const ISSUE_BODY_MAX = 4000;
/** Max title length (GitHub truncates ~256; keep it concise). */
export const ISSUE_TITLE_MAX = 120;
/** Cap per context section so one giant field can't dominate the body. */
const SECTION_MAX = 1500;
/** Cap a single recent-tool / one-line section. */
const LINE_MAX = 120;
/** How many recent tools to include. */
const RECENT_TOOLS_MAX = 12;

/** Failure context an issue is drafted from — mirrors `/bug`'s capture shape. */
export type IssueContext = {
  summary: string;
  errorSignal?: string;
  recentTools?: string[];
  gitState?: string;
};

/** A drafted (not-yet-created) GitHub issue. */
export type IssueDraft = {
  title: string;
  body: string;
  labels: string[];
};

// Hex-escaped in strings (no literal control bytes in source). ANSI CSI escapes,
// then C0/DEL control bytes EXCEPT \t (\x09) \n (\x0a) \r (\x0d) which we keep.
const ANSI_CSI = new RegExp("\\x1b\\[[0-9;]*[A-Za-z]", "g");
const CONTROL_BYTES = new RegExp("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]", "g");

/**
 * Strip ANSI escapes and control bytes, then collapse intra-line whitespace.
 * The summary/body come from agent + error output, so this is a security
 * boundary, not cosmetics - control bytes never reach the `gh` argv.
 */
function controlStrip(s: string): string {
  return s.replace(ANSI_CSI, "").replace(CONTROL_BYTES, "").replace(/[\t\r ]+/g, " ");
}

/** Control-strip + cap one section of the body (one-line collapse). */
function section(s: string, max = SECTION_MAX): string {
  return oneLine(controlStrip(s), max);
}

/** Build a concise issue title from the summary. Pure. */
function buildTitle(summary: string): string {
  const clean = oneLine(controlStrip(summary), ISSUE_TITLE_MAX);
  return clean || "Recurring error (auto-filed)";
}

/** Build the issue body from the failure context. Pure, control-stripped, capped. */
function buildBody(ctx: IssueContext): string {
  const tools = (ctx.recentTools ?? [])
    .slice(-RECENT_TOOLS_MAX)
    .map((t) => `- ${oneLine(controlStrip(t), LINE_MAX)}`);
  const parts = [
    "## Summary",
    section(ctx.summary) || "(no summary captured)",
    "",
    "## Error signal",
    ctx.errorSignal ? section(ctx.errorSignal) : "(none captured)",
    "",
    "## Recent tool calls",
    tools.length ? tools.join("\n") : "(none)",
    "",
    "## Git state",
    ctx.gitState ? section(ctx.gitState, LINE_MAX) : "(unknown)",
    "",
    "---",
    "_Auto-drafted by Vanta from a recurring-error signal. Review before filing._",
  ];
  const body = parts.join("\n");
  return body.length > ISSUE_BODY_MAX ? `${body.slice(0, ISSUE_BODY_MAX - 1)}…` : body;
}

/** Draft a GitHub issue from failure context. Pure. */
export function buildIssueDraft(ctx: IssueContext): IssueDraft {
  return { title: buildTitle(ctx.summary), body: buildBody(ctx), labels: [...DEFAULT_ISSUE_LABELS] };
}

/** Whether auto-issue drafting is enabled. OFF unless `VANTA_AUTO_ISSUE=1`. Pure. */
export function autoIssueEnabled(env: Record<string, string | undefined>): boolean {
  return env.VANTA_AUTO_ISSUE === "1";
}

/** The ESC-cancellable countdown before an issue is created. */
export type CancelWindowState = {
  remainingMs: number;
  cancelled: boolean;
  fired: boolean;
};

/** Open a fresh cancel window for `durationMs`. Pure. */
export function newCancelWindow(durationMs: number): CancelWindowState {
  return { remainingMs: Math.max(0, durationMs), cancelled: false, fired: false };
}

/**
 * Count the window down by `elapsedMs`. At 0 the issue fires (`fired:true`)
 * UNLESS it was cancelled. A cancelled or already-fired window is terminal —
 * it never fires and never resurrects. Pure.
 */
export function tickCancelWindow(state: CancelWindowState, elapsedMs: number): CancelWindowState {
  if (state.cancelled || state.fired) return state;
  const remainingMs = Math.max(0, state.remainingMs - Math.max(0, elapsedMs));
  return { remainingMs, cancelled: false, fired: remainingMs === 0 };
}

/** ESC pressed: cancel the window so a subsequent tick never fires. Pure. */
export function cancelWindow(state: CancelWindowState): CancelWindowState {
  if (state.fired) return state;
  return { ...state, cancelled: true };
}

/**
 * Build the `gh issue create` argv for a draft. Each label is a separate
 * `--label <value>` pair; every value is its own argv item (NO shell string
 * interpolation — control-stripped title/body pass through safely). Pure;
 * NOT executed here (the gh exec is the boundary). Pass `repo` (owner/name) to
 * target a specific repository.
 */
export function buildGhIssueArgs(draft: IssueDraft, repo?: string): string[] {
  const args = ["issue", "create", "--title", draft.title, "--body", draft.body];
  for (const label of draft.labels) args.push("--label", label);
  if (repo) args.push("--repo", repo);
  return args;
}
