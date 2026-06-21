import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";

// ───────────────────────────────────────────────────────────────────────────
// VANTA-ASK-USER-TOOL — the STRUCTURED sibling of `clarify`.
//
// `clarify` collects free text. `ask_user` collects a user-OWNED decision:
// one or more questions, each with 2-4 labelled options and optional
// multi-select. End-of-turn design (mirrors clarify): the tool only FORMATS
// the question set into `output` for the model to surface; it never runs a
// live picker and never acts on the answer.
//
// The live multi-select picker is the HOST's job, NOT this tool's:
//   the TUI (`vanta-ts/src/ui/`) would render the formatted question set as an
//   interactive numbered/checkbox picker (one list per question, single- vs
//   multi-select per `multiSelect`), collect the operator's raw picks, and feed
//   them straight into `validateAnswers(questions, rawAnswers)` to resolve the
//   chosen option label(s). That picker is the documented boundary of this
//   slice — built next, not here. The pure model below is what it sits on.
// ───────────────────────────────────────────────────────────────────────────

const MAX_QUESTIONS = 4;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_HEADER_LEN = 12;

const OptionSchema = z.object({
  label: z.string().min(1, "option.label must be non-empty"),
  description: z.string().min(1, "option.description must be non-empty"),
});

const QuestionSchema = z.object({
  header: z
    .string()
    .min(1, "header must be non-empty")
    .max(MAX_HEADER_LEN, `header must be ≤${MAX_HEADER_LEN} chars`),
  question: z.string().min(1, "question must be non-empty"),
  options: z
    .array(OptionSchema)
    .min(MIN_OPTIONS, `each question needs ${MIN_OPTIONS}-${MAX_OPTIONS} options`)
    .max(MAX_OPTIONS, `each question needs ${MIN_OPTIONS}-${MAX_OPTIONS} options`),
  /** When true the operator may pick any number of options (else exactly one). */
  multiSelect: z.boolean().optional(),
});

export const AskQuestionSchema = z.object({
  questions: z
    .array(QuestionSchema)
    .min(1, "questions must be non-empty")
    .max(MAX_QUESTIONS, `at most ${MAX_QUESTIONS} questions`),
});

export type AskOption = z.infer<typeof OptionSchema>;
export type AskQuestion = z.infer<typeof QuestionSchema>;

/** One question's resolved answer: the chosen option label(s). */
export type ResolvedSelection = { header: string; selected: string[] };

export type ValidateInputResult =
  | { ok: true; questions: AskQuestion[] }
  | { ok: false; error: string };

export type ValidateAnswersResult =
  | { ok: true; selections: ResolvedSelection[] }
  | { ok: false; error: string };

// Strip control chars (incl. ANSI ESC) — question/option text comes from the
// model, so it could carry terminal-control codes; neutralize before any host
// renders it. Newlines collapse to a space (a header/option is one line).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/g;

/** Remove control characters and trim. Pure. */
function controlStrip(text: string): string {
  return text.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/** Sanitize one option's model-supplied text. Pure. */
function cleanOption(o: AskOption): AskOption {
  return { label: controlStrip(o.label), description: controlStrip(o.description) };
}

/** Sanitize one question's model-supplied text. Pure. */
function cleanQuestion(q: AskQuestion): AskQuestion {
  return {
    header: controlStrip(q.header),
    question: controlStrip(q.question),
    options: q.options.map(cleanOption),
    ...(q.multiSelect === undefined ? {} : { multiSelect: q.multiSelect }),
  };
}

/**
 * Parse + validate a raw question set at the LLM boundary, returning
 * control-stripped questions. An empty/invalid set → an actionable error.
 * Pure.
 */
export function validateAskInput(raw: unknown): ValidateInputResult {
  const parsed = AskQuestionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return { ok: false, error: `Invalid question set — ${where}${first?.message ?? "parse failed"}` };
  }
  return { ok: true, questions: parsed.data.questions.map(cleanQuestion) };
}

/** Render one question + its numbered options + the pick hint. Pure. */
function renderQuestion(q: AskQuestion, index: number): string {
  const hint = q.multiSelect ? "(pick any)" : "(pick one)";
  const opts = q.options
    .map((o, i) => `  ${i + 1}. ${o.label} — ${o.description}`)
    .join("\n");
  return `${index + 1}. [${q.header}] ${q.question} ${hint}\n${opts}`;
}

/** Format the operator-facing question set. Pure. */
export function formatAskPrompt(questions: AskQuestion[]): string {
  const body = questions.map(renderQuestion).join("\n\n");
  return `${body}\n\n(Await the user's selection before proceeding.)`;
}

/** Coerce one raw answer (a 1-based number or an option label) to a label. Pure. */
function coerceOne(q: AskQuestion, raw: unknown): { ok: true; label: string } | { ok: false; error: string } {
  const labels = q.options.map((o) => o.label);
  if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw.trim()))) {
    const n = typeof raw === "number" ? raw : Number(raw.trim());
    if (!Number.isInteger(n) || n < 1 || n > labels.length) {
      return { ok: false, error: `[${q.header}] pick ${n} is out of range (1-${labels.length})` };
    }
    return { ok: true, label: labels[n - 1]! };
  }
  if (typeof raw === "string") {
    const match = labels.find((l) => l.toLowerCase() === controlStrip(raw).toLowerCase());
    if (!match) {
      return { ok: false, error: `[${q.header}] "${controlStrip(raw)}" is not one of: ${labels.join(", ")}` };
    }
    return { ok: true, label: match };
  }
  return { ok: false, error: `[${q.header}] answer must be a number or an option label` };
}

/** Resolve one question's raw picks (number(s)/label(s)) to option labels. Pure. */
function resolveOne(q: AskQuestion, raw: unknown): { ok: true; selected: string[] } | { ok: false; error: string } {
  const picks = Array.isArray(raw) ? raw : [raw];
  if (picks.length === 0) return { ok: false, error: `[${q.header}] no selection provided` };
  if (!q.multiSelect && picks.length > 1) {
    return { ok: false, error: `[${q.header}] is single-select — pick exactly one option` };
  }
  const selected: string[] = [];
  for (const p of picks) {
    const one = coerceOne(q, p);
    if (!one.ok) return one;
    if (!selected.includes(one.label)) selected.push(one.label);
  }
  return { ok: true, selected };
}

/**
 * Validate the operator's raw picks against the question set, returning the
 * resolved option label(s) per question. `rawAnswers` is keyed by header.
 * Out-of-range / wrong-cardinality picks → an actionable error. Pure.
 */
export function validateAnswers(
  questions: AskQuestion[],
  rawAnswers: Record<string, unknown>,
): ValidateAnswersResult {
  const selections: ResolvedSelection[] = [];
  for (const q of questions) {
    if (!(q.header in rawAnswers)) {
      return { ok: false, error: `[${q.header}] is unanswered` };
    }
    const resolved = resolveOne(q, rawAnswers[q.header]);
    if (!resolved.ok) return resolved;
    selections.push({ header: q.header, selected: resolved.selected });
  }
  return { ok: true, selections };
}

const SAFETY_DESC = "ask the user a structured question";

export const askUserTool: Tool = {
  schema: {
    name: "ask_user",
    description:
      "Ask the operator a STRUCTURED question set when a genuinely user-owned " +
      "decision must be collected cleanly — use this over free-text `clarify` " +
      "when the answer is a choice among labelled options. Provide 1-4 " +
      "questions; each has a short `header` (≤12 chars), the `question` text, " +
      "2-4 `options` (label + description), and optional `multiSelect`. Returns " +
      "the formatted question set for you to surface; await the user's " +
      "selection before proceeding. Ask only what the user must decide.",
    parameters: {
      type: "object",
      required: ["questions"],
      properties: {
        questions: {
          type: "array",
          description: "1-4 structured questions to put to the operator.",
          items: {
            type: "object",
            required: ["header", "question", "options"],
            properties: {
              header: { type: "string", description: "Short label, ≤12 chars." },
              question: { type: "string", description: "The question to ask." },
              options: {
                type: "array",
                description: "2-4 labelled options.",
                items: {
                  type: "object",
                  required: ["label", "description"],
                  properties: {
                    label: { type: "string", description: "Short option label." },
                    description: { type: "string", description: "What the option means." },
                  },
                },
              },
              multiSelect: {
                type: "boolean",
                description: "Allow picking any number of options (default: pick one).",
              },
            },
          },
        },
      },
    },
  },
  describeForSafety: () => SAFETY_DESC,
  async execute(raw): Promise<ToolResult> {
    const parsed = validateAskInput(raw);
    if (!parsed.ok) return { ok: false, output: parsed.error };
    return { ok: true, output: formatAskPrompt(parsed.questions) };
  },
};
