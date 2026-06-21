// ND-WORKING-MEMORY-RAIL — an always-on "working memory" rail keeping the
// active GOAL + the CURRENT step + the REMAINING steps visible so the operator
// (and the agent) never loses the thread. Pure builder + visibility + segment
// model; the live render wires it in app-regions.tsx (see NAMED render point
// below). Empty working memory → "" (hidden), mirroring the current single-goal
// `◇ <goal>` line.
//
// NAMED render point (NOT wired this slice): `Footer` in
// `vanta-ts/src/ui/app-regions.tsx` renders the lone `◇ <goal>` line
// (currently `<Text>{props.goal ? <>◇ {goalClip(props.goal)}</> : " "}</Text>`).
// A wiring slice would assemble a `WorkingMemory` from the session's active goal
// (`ctx.setup.safety.getGoals()` active goal text) + the agent's todo/next state
// (the `todo` tool entries: completed → done, the first open → currentStep, the
// rest → remaining) and replace that single line with `buildWorkingMemoryRail(wm)`
// (or `railSegments(wm)` for a multi-part render), gated by `railVisible(wm, env)`.
// This mirrors how clarity-gate ships the pure scorer and names — but does not
// wire — its surfacing point.

/**
 * The working-memory model surfaced by the rail: the active GOAL, the CURRENT
 * step in progress, and the REMAINING steps still to do. All optional/empty —
 * an empty model renders nothing.
 */
export type WorkingMemory = {
  /** The active goal (the thread). */
  goal?: string;
  /** The step in progress right now. */
  currentStep?: string;
  /** The steps still to do after the current one. */
  remaining: string[];
};

/** A labelled part of the rail for a multi-part render. */
export type RailSegment = {
  /** The part name: which slot this is. */
  label: "goal" | "step" | "remaining";
  /** The display text for the part (already clipped + control-stripped). */
  text: string;
};

/** Options for building the compact rail string. */
export type RailBuildOptions = {
  /** Max width each free-text part (goal / step) is clipped to. */
  partWidth?: number;
};

/** Glyphs — `◇` mirrors the existing goal line; `▸` marks the current step. */
const GOAL_GLYPH = "◇";
const STEP_GLYPH = "▸";
/** Separator between rail parts (mirrors the status-bar `·` mid-dot). */
const SEP = " · ";
/** Default clip width for a free-text part before an ellipsis. */
const DEFAULT_PART_WIDTH = 48;
/** Env flag that disables the rail entirely. */
const DISABLE_FLAG = "0";

/**
 * Strip ANSI escapes + C0/C1 control chars (goal/step text is untrusted — it
 * comes from goals/todo entries an operator or the model wrote) and collapse
 * whitespace. Mirrors the sanitiser in `ui/agent-identity.ts`. Pure.
 */
function sanitize(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiStripped = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // C0 controls (incl. lone ESC/tab/newline) + DEL + C1 controls → a space.
  // eslint-disable-next-line no-control-regex
  const controlStripped = ansiStripped.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return controlStripped.replace(/\s+/g, " ").trim();
}

/** Clip to `width`, appending an ellipsis when truncated. Pure. */
function clip(text: string, width: number): string {
  const w = width > 0 ? width : DEFAULT_PART_WIDTH;
  return text.length > w ? `${text.slice(0, w - 1)}…` : text;
}

/** Sanitise then clip a free-text part. "" when empty after sanitising. Pure. */
function part(raw: string | undefined, width: number): string {
  const clean = sanitize(raw ?? "");
  return clean === "" ? "" : clip(clean, width);
}

/** The remaining steps that survive sanitising (empty/blank entries dropped). Pure. */
function liveRemaining(wm: WorkingMemory): string[] {
  return (wm.remaining ?? []).map((s) => sanitize(s)).filter((s) => s !== "");
}

/**
 * True when the working memory has ANY content — a goal, a current step, or at
 * least one remaining step (after sanitising). Pure. Drives `railVisible` and
 * the empty → "" contract.
 */
export function hasWorkingMemory(wm: WorkingMemory): boolean {
  return (
    sanitize(wm.goal ?? "") !== "" ||
    sanitize(wm.currentStep ?? "") !== "" ||
    liveRemaining(wm).length > 0
  );
}

/**
 * Build the compact one/two-line rail string:
 *   `◇ <goal> · ▸ <currentStep> · +N more`
 * Each free-text part is control-stripped and clipped to `opts.partWidth`. Parts
 * with no content are omitted (no goal → no `◇` segment, etc.). Returns "" when
 * there is no goal AND no current step AND no remaining (hidden = current
 * behaviour). Pure.
 */
export function buildWorkingMemoryRail(wm: WorkingMemory, opts?: RailBuildOptions): string {
  const width = opts?.partWidth ?? DEFAULT_PART_WIDTH;
  const goal = part(wm.goal, width);
  const step = part(wm.currentStep, width);
  const remainingCount = liveRemaining(wm).length;

  const parts: string[] = [];
  if (goal !== "") parts.push(`${GOAL_GLYPH} ${goal}`);
  if (step !== "") parts.push(`${STEP_GLYPH} ${step}`);
  if (remainingCount > 0) parts.push(`+${remainingCount} more`);

  return parts.join(SEP);
}

/**
 * Visible when the working memory has content AND the rail is not disabled via
 * `VANTA_WM_RAIL=0`. Pure. Empty WM → false; `VANTA_WM_RAIL=0` → false; content
 * with the flag unset/any-other-value → true.
 */
export function railVisible(wm: WorkingMemory, env: NodeJS.ProcessEnv): boolean {
  if (env.VANTA_WM_RAIL === DISABLE_FLAG) return false;
  return hasWorkingMemory(wm);
}

/**
 * The present rail parts as `{label, text}[]` for a multi-part render — only the
 * slots with content appear (a goal-only WM yields one `goal` segment; an empty
 * WM yields `[]`). `remaining` carries the `+N more` summary text. Free-text
 * parts are control-stripped + clipped to `opts.partWidth`. Pure.
 */
export function railSegments(wm: WorkingMemory, opts?: RailBuildOptions): RailSegment[] {
  const width = opts?.partWidth ?? DEFAULT_PART_WIDTH;
  const segments: RailSegment[] = [];

  const goal = part(wm.goal, width);
  if (goal !== "") segments.push({ label: "goal", text: goal });

  const step = part(wm.currentStep, width);
  if (step !== "") segments.push({ label: "step", text: step });

  const remainingCount = liveRemaining(wm).length;
  if (remainingCount > 0) segments.push({ label: "remaining", text: `+${remainingCount} more` });

  return segments;
}
