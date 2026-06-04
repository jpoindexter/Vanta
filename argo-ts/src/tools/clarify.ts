import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({
  question: z.string().min(1, "question must be non-empty"),
  options: z.array(z.string().min(1)).optional(),
});

export const clarifyTool: Tool = {
  schema: {
    name: "clarify",
    description:
      "Ask the user a clarifying question when their intent is ambiguous. " +
      "Returns the formatted question for you to surface in your reply. " +
      "Use this instead of guessing — wrong assumptions cost rework. " +
      "Ask one question per turn; await the user's answer before proceeding.",
    parameters: {
      type: "object",
      required: ["question"],
      properties: {
        question: {
          type: "string",
          description: "The clarifying question to ask the user.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional structured choices. Numbered automatically. " +
            "Omit for open-ended answers.",
        },
      },
    },
  },
  describeForSafety: () => "ask user a clarifying question",
  async execute(raw, _ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { question, options } = parsed.data;

    let output = question;
    if (options?.length) {
      output += "\n\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    }
    output += "\n\n(Await the user's answer before proceeding.)";

    return { ok: true, output };
  },
};
