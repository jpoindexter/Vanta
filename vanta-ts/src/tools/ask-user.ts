import type { Tool, ToolResult } from "./types.js";
import { validateAskInput, formatAskPrompt } from "./ask-user-model.js";

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
//   slice — built next, not here. The pure model in `ask-user-model.ts` is what
//   it sits on; the public model symbols are re-exported below.
// ───────────────────────────────────────────────────────────────────────────

export * from "./ask-user-model.js";

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
