import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";

/** A single typed field in a structured interview request. */
const FieldSchema = z.object({
  name: z.string().min(1, "field.name must be non-empty"),
  type: z.enum(["string", "number", "boolean", "enum"]),
  label: z.string().min(1).optional(),
  /** Allowed values for an enum field. Required when type === "enum". */
  choices: z.array(z.string().min(1)).min(1).optional(),
  /** Defaults to true; a false field may be omitted from the response. */
  required: z.boolean().optional(),
});
type Field = z.infer<typeof FieldSchema>;

const Args = z.object({
  question: z.string().min(1, "question must be non-empty"),
  options: z.array(z.string().min(1)).optional(),
  /** Declares typed fields the user's answer must satisfy. Omit for free-text. */
  fields: z.array(FieldSchema).min(1).optional(),
  /** The user's structured answer, validated against `fields` at the boundary. */
  response: z.record(z.string(), z.unknown()).optional(),
});

const AWAIT_NOTE = "\n\n(Await the user's answer before proceeding.)";

/** Build a zod validator for one declared field. Pure. */
function validatorFor(field: Field): z.ZodTypeAny {
  if (field.type === "enum") {
    const choices = field.choices ?? [];
    return z.enum(choices as [string, ...string[]]);
  }
  if (field.type === "number") return z.number();
  if (field.type === "boolean") return z.boolean();
  return z.string().min(1);
}

/** Compose declared fields into one response schema. Pure. */
function responseSchema(fields: Field[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const base = validatorFor(f);
    shape[f.name] = f.required === false ? base.optional() : base;
  }
  return z.object(shape).strict();
}

/** Reject an enum field that declares no choices — schema error, caught early. */
function enumChoiceError(fields: Field[]): string | null {
  const bad = fields.find((f) => f.type === "enum" && !(f.choices?.length));
  return bad ? `enum field "${bad.name}" requires non-empty choices` : null;
}

/** Format a typed field for the interview prompt. Pure. */
function describeField(field: Field): string {
  const label = field.label ?? field.name;
  const opt = field.required === false ? " (optional)" : "";
  const kind = field.type === "enum" ? `[${(field.choices ?? []).join(" | ")}]` : `<${field.type}>`;
  return `- ${label}${opt}: ${kind}`;
}

/** Render the structured interview request (no response yet). Pure. */
function renderRequest(question: string, fields: Field[]): string {
  const body = fields.map(describeField).join("\n");
  return `${question}\n\nProvide:\n${body}${AWAIT_NOTE}`;
}

/** Validate the user's structured response, returning typed values. Pure. */
function validateResponse(fields: Field[], response: Record<string, unknown>): ToolResult {
  const parsed = responseSchema(fields).safeParse(response);
  if (!parsed.success) {
    return { ok: false, output: `Invalid response: ${parsed.error.message}` };
  }
  return { ok: true, output: JSON.stringify(parsed.data) };
}

/** Free-text (+ optional numbered choices) path — unchanged legacy behavior. Pure. */
function renderFreeText(question: string, options?: string[]): ToolResult {
  let output = question;
  if (options?.length) {
    output += "\n\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n");
  }
  output += AWAIT_NOTE;
  return { ok: true, output };
}

export const clarifyTool: Tool = {
  schema: {
    name: "clarify",
    description:
      "Ask the user a clarifying question when their intent is ambiguous. " +
      "Returns the formatted question for you to surface in your reply. " +
      "Use this instead of guessing — wrong assumptions cost rework. " +
      "Ask one question per turn; await the user's answer before proceeding. " +
      "Pass `fields` to request STRUCTURED, schema-validated input (typed " +
      "values / explicit enum choices); once you have the user's answer, call " +
      "again with the same `fields` plus `response` to validate and get typed " +
      "values back. Omit `fields` for free-text (optionally with `options`).",
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
            "Optional free-text choices. Numbered automatically. " +
            "Omit for open-ended answers. Ignored when `fields` is set.",
        },
        fields: {
          type: "array",
          description:
            "Declares typed fields the answer must satisfy " +
            "(string/number/boolean/enum). Turns this into a structured interview.",
          items: {
            type: "object",
            required: ["name", "type"],
            properties: {
              name: { type: "string", description: "Field key." },
              type: {
                type: "string",
                enum: ["string", "number", "boolean", "enum"],
                description: "Field value type.",
              },
              label: { type: "string", description: "Human label (defaults to name)." },
              choices: {
                type: "array",
                items: { type: "string" },
                description: "Allowed values; required when type is enum.",
              },
              required: {
                type: "boolean",
                description: "Defaults true; false allows omitting the field.",
              },
            },
          },
        },
        response: {
          type: "object",
          description:
            "The user's structured answer. When set with `fields`, it is " +
            "zod-validated and typed values are returned.",
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
    const { question, options, fields, response } = parsed.data;

    if (fields?.length) {
      const choiceErr = enumChoiceError(fields);
      if (choiceErr) return { ok: false, output: `Invalid args: ${choiceErr}` };
      return response
        ? validateResponse(fields, response)
        : { ok: true, output: renderRequest(question, fields) };
    }

    return renderFreeText(question, options);
  },
};
