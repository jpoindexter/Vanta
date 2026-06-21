import { PLAN_MARKER } from "./plan-mode.js";

// VANTA-MSG-PLAN-APPROVAL — render a PLAN as a distinct transcript block with
// numbered steps + an explicit approve/edit/reject affordance, and resolve a key
// press to a decision. Pure parse + render + decision; zero I/O, zero LLM —
// same heuristic-bank shape as clarity-gate / mode-detect.
//
// WIRING (NAMED, not wired this round — mirrors clarity-gate's deliver-only round):
//   • RENDER: ui/transcript.tsx would gain a `plan` Entry kind whose view calls
//     `formatPlanApproval(parsePlanSteps(e.text))` and prints it as a bordered
//     block (the affordance line styled like the approval prompt). A message that
//     is NOT a plan (`!isPlanMessage(text)`) renders plainly through the existing
//     assistant/note path — no plan chrome.
//   • DECIDE: a `useInput` key handler on the focused plan row would feed each
//     keypress through `resolvePlanDecision(key)`; a non-null verdict
//     ("approve"|"edit"|"reject") drives the same approve/edit/reject action
//     `/planmode approve` already exposes (plan-mode.ts), then commits the row.

/** Affordance line shown under a rendered plan. */
const AFFORDANCE = "[a]pprove · [e]dit · [r]eject";

/** Strip control chars (ANSI/C0/C1) so a noisy step can't corrupt the render. */
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/** A leading numbered (`1.` / `1)` ) or bulleted (`-` / `*` / `•`) list marker. */
const LIST_MARKER = /^\s*(?:\d+[.)]\s+|[-*•]\s+)/;

/** Lines that are plan scaffolding, not steps (a heading / the marker / affordance). */
const PLAN_SCAFFOLD = /^\s*(?:plan\b|#+\s|<!--|\[a\]pprove)/i;

function stripControl(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extract the ordered steps from a plan's text. Tolerant: prefers explicit
 * numbered/bulleted list items; if none are present it falls back to every
 * non-empty, non-scaffold line (so a bare line-per-step plan still parses).
 * Each returned step is control-stripped + whitespace-collapsed. Pure.
 * Empty / whitespace-only input → []. The list marker itself is dropped.
 */
export function parsePlanSteps(text: string): string[] {
  const lines = (text ?? "").split("\n");
  const marked = lines
    .filter((l) => LIST_MARKER.test(l))
    .map((l) => stripControl(l.replace(LIST_MARKER, "")))
    .filter((l) => l.length > 0);
  if (marked.length > 0) return marked;

  return lines
    .map((l) => stripControl(l))
    .filter((l) => l.length > 0 && !PLAN_SCAFFOLD.test(l));
}

/**
 * Render the approval block: a header with the step count, the numbered steps,
 * and the affordance line. `▸ Plan (N steps):` over `  1. …` lines over
 * `[a]pprove · [e]dit · [r]eject`. Pure. No steps → a header that says so
 * (still offers the affordance so an empty plan can be rejected).
 */
export function formatPlanApproval(steps: string[]): string {
  const count = steps.length;
  const label = count === 1 ? "step" : "steps";
  const header = `▸ Plan (${count} ${label}):`;
  const body = steps.map((step, i) => `  ${i + 1}. ${step}`);
  return [header, ...body, AFFORDANCE].join("\n");
}

export type PlanDecision = "approve" | "edit" | "reject";

/** Key aliases per decision (lowercased). Data-driven so the lookup stays flat. */
const DECISION_KEYS: Record<PlanDecision, ReadonlySet<string>> = {
  approve: new Set(["a", "enter", "return", "\r", "\n"]),
  edit: new Set(["e"]),
  reject: new Set(["r", "escape", "esc", "\x1b"]),
};

/**
 * Resolve a keypress to a plan decision, or null when the key is not a control.
 * a / Enter → approve · e → edit · r / Escape → reject · anything else → null.
 * Case-insensitive on the letter keys. Pure.
 */
export function resolvePlanDecision(key: string): PlanDecision | null {
  const k = (key ?? "").toLowerCase();
  for (const decision of Object.keys(DECISION_KEYS) as PlanDecision[]) {
    if (DECISION_KEYS[decision].has(k)) return decision;
  }
  return null;
}

/**
 * Whether a message LOOKS like a plan worth rendering with the approval block:
 * it carries the plan-first marker (plan-mode.ts injects `PLAN_MARKER`), OR it
 * has at least two parsed steps. A plain reply (one line, no marker, no list)
 * is not a plan and renders plainly. Pure.
 */
export function isPlanMessage(text: string): boolean {
  const t = text ?? "";
  if (t.includes(PLAN_MARKER)) return true;
  return parsePlanSteps(t).length >= 2;
}
