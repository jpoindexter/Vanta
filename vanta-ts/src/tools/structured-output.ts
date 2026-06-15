import type { Tool } from "./types.js";
import { validateAgainstSchema } from "../output/json-schema.js";

export const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

export function buildStructuredOutputTool(schema: Record<string, unknown>): Tool {
  return {
    schema: {
      name: STRUCTURED_OUTPUT_TOOL,
      description: "Return the final answer as arguments matching the requested JSON schema.",
      parameters: schema,
    },
    describeForSafety: () => "return structured output",
    async execute(args) {
      const errors = validateAgainstSchema(args, schema);
      if (errors.length) {
        return { ok: false, output: `StructuredOutput schema validation failed:\n${errors.join("\n")}` };
      }
      return { ok: true, output: JSON.stringify(args, null, 2) };
    },
  };
}

export function buildStructuredOutputInstruction(schema: Record<string, unknown>): string {
  return [
    "",
    "Structured output mode is active.",
    "Your final action MUST be to call StructuredOutput with arguments matching this JSON Schema.",
    "Do not answer in prose after calling StructuredOutput.",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}
