import type { Tool, ToolResult } from "./types.js";
import { validateAskInput, formatAskPrompt, formatAskResponse } from "./ask-user-model.js";

// ───────────────────────────────────────────────────────────────────────────
// VANTA-ASK-USER-TOOL — the STRUCTURED sibling of `clarify`.
//
// `clarify` collects free text. `ask_user` collects a user-OWNED decision:
// one or more questions, each with 2-4 labelled options and optional
// multi-select. Interactive hosts pause the SAME agent turn, collect the
// operator's answer, and return it as the tool result. Non-interactive hosts
// retain the formatted end-of-turn fallback.
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
                    preview: { type: "string", description: "Optional compact content preview shown for this option." },
                  },
                },
              },
              multiSelect: {
                type: "boolean",
                description: "Allow picking any number of options (default: pick one).",
              },
              allowOther: {
                type: "boolean",
                description: "Allow an operator-authored answer after the proposed options (default: true).",
              },
            },
          },
        },
      },
    },
  },
  describeForSafety: () => SAFETY_DESC,
  async execute(raw, ctx): Promise<ToolResult> {
    const parsed = validateAskInput(raw);
    if (!parsed.ok) return { ok: false, output: parsed.error };
    if (ctx.requestQuestion) {
      const response = await ctx.requestQuestion(parsed.questions);
      return response
        ? { ok: true, output: formatAskResponse(response) }
        : { ok: true, output: "Operator cancelled the question without selecting an answer." };
    }
    return { ok: true, output: formatAskPrompt(parsed.questions) };
  },
};
