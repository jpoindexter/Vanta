// VANTA-ADVISOR-MSG — pure formatter for the advisor (stronger-model reviewer) line.
//
// When a stronger "advisor" model reviews the main model's work (see
// `agent/advisor.ts` — `resolveAdvisorProvider`/`runAdvisor`, gated by
// VANTA_ADVISOR_MODEL), its response should surface in the transcript as a
// distinct, clearly-attributed line so the operator can tell advisor feedback
// apart from the main agent. This module owns ONLY the string shape:
//
//   "⚖ advisor (<model>): <review>"
//
// The advisor text and model label are untrusted (an LLM produced one, env set
// the other), so both are stripped of control/ANSI sequences before rendering —
// neither can inject a terminal escape into the transcript. Text is truncated to
// a sane max with an ellipsis so a long review stays bounded.
//
// WIRING (not done this round, named for the follow-up — mirrors clarity-gate):
//   - Producer: `agent/advisor.ts runAdvisor(...)` returns the review string;
//     its model label comes from `resolveAdvisorProvider(env).modelId()`.
//   - Surface: feed `formatAdvisorMessage(label, review)` to the transcript as a
//     `{ kind: "note", text }` entry (`ui/reducer.ts` addNote -> `ui/transcript.tsx`
//     NoteView), gated on `advisorEnabled(env)`. No advisor configured -> nothing
//     shown (current behavior preserved — this module renders nothing on its own).

/** The advisor attribution glyph — a balance scale (reviewer / second opinion). */
export const ADVISOR_GLYPH = "⚖";

/** Max rendered length of the advisor text before truncation (then ellipsis). */
export const ADVISOR_TEXT_MAX = 600;

const ELLIPSIS = "…";

// Full ANSI escape sequences (CSI / OSC / single-char), 7-bit (ESC-introduced)
// and 8-bit (\x9b CSI / \x9d OSC) — removed ENTIRELY (introducer + parameter +
// final bytes) so the model label and review text can neither inject an escape
// nor leave the visible parameter residue (e.g. "[31m") behind.
const ANSI_SEQUENCE = new RegExp(
  "[\\u001b\\u009b][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-Za-z]" +
    "|\\u001b[@-Z\\\\-_]",
  "g",
);
// Any remaining bare control char (NUL, BEL, DEL, newlines, tabs handled by the
// whitespace pass) — stripped to a space. Mirrors term/terminal-title.ts.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u009b\\u009d]", "g");
const WHITESPACE_RUN = /[ \t]+/g;

export type FormatAdvisorOptions = {
  /** Override the default text truncation length. */
  readonly maxLen?: number;
};

/** Strip control/ANSI sequences, collapse horizontal whitespace runs, trim.
 *  Newlines fall inside the control range too, so they collapse to a space —
 *  the advisor line is one logical note, so this keeps it on one line and stops a
 *  forged newline from spoofing a second transcript row. */
function sanitize(raw: string): string {
  return raw
    .replace(ANSI_SEQUENCE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** The "advisor (<model>)" attribution string, with the model label sanitized.
 *  An empty/blank label falls back to a bare "advisor" (no empty parens). */
export function advisorAttribution(modelLabel: string): string {
  const label = sanitize(modelLabel);
  return label.length > 0 ? `advisor (${label})` : "advisor";
}

/** Truncate to at most `max` chars, appending an ellipsis when cut. */
function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`;
}

/** Format one attributed advisor line:  "⚖ advisor (<model>): <text>".
 *  Both label and text are control/ANSI-stripped (no escape injection); text is
 *  truncated to `opts.maxLen ?? ADVISOR_TEXT_MAX` with an ellipsis. Empty text
 *  renders the attribution alone ("⚖ advisor (<model>):"). */
export function formatAdvisorMessage(
  modelLabel: string,
  text: string,
  opts: FormatAdvisorOptions = {},
): string {
  const attribution = advisorAttribution(modelLabel);
  const max = opts.maxLen ?? ADVISOR_TEXT_MAX;
  const body = truncate(sanitize(text), max);
  const head = `${ADVISOR_GLYPH} ${attribution}:`;
  return body.length > 0 ? `${head} ${body}` : head;
}

/** Whether an advisor line should be shown — true only when an advisor model is
 *  configured (VANTA_ADVISOR_MODEL set and not "off"). Mirrors the disabled-when-
 *  unset semantics of `agent/advisor.ts resolveAdvisorProvider`. No advisor
 *  configured → false → nothing shown. */
export function advisorEnabled(env: NodeJS.ProcessEnv): boolean {
  const model = (env.VANTA_ADVISOR_MODEL ?? "").trim().toLowerCase();
  return model.length > 0 && model !== "off";
}
