import type { ToolSchema } from "../providers/interface.js";
import type { ToolCall } from "../types.js";
import type { AgentOutcome, StoppedReason } from "./agent-types.js";
import { validateAgainstSchema } from "../output/json-schema.js";
import { buildStructuredOutputTool, STRUCTURED_OUTPUT_TOOL } from "../tools/structured-output.js";

type StructuredResult =
  | { handled: false }
  | { handled: true; output: string; structuredResult?: unknown };

export function schemasWithStructuredOutput(
  schemas: ToolSchema[],
  outputSchema: Record<string, unknown> | undefined,
): ToolSchema[] {
  return outputSchema ? [...schemas, buildStructuredOutputTool(outputSchema).schema] : schemas;
}

export function maybeStructuredOutput(
  calls: ToolCall[],
  outputSchema: Record<string, unknown> | undefined,
): StructuredResult {
  if (!outputSchema) return { handled: false };
  const call = calls.find((c) => c.name === STRUCTURED_OUTPUT_TOOL);
  if (!call) return { handled: false };
  const errors = validateAgainstSchema(call.arguments, outputSchema);
  if (errors.length) {
    return { handled: true, output: `StructuredOutput schema validation failed:\n${errors.join("\n")}` };
  }
  return { handled: true, output: JSON.stringify(call.arguments, null, 2), structuredResult: call.arguments };
}

export function structuredOutcome(
  result: Extract<StructuredResult, { handled: true }>,
  iter: number,
  usage: { inputTokens: number; outputTokens: number } | undefined,
  stoppedReason: StoppedReason = "done",
): AgentOutcome {
  return {
    finalText: result.output,
    iterations: iter,
    stoppedReason,
    toolIterations: 1,
    ...(usage ? { usage } : {}),
    ...(result.structuredResult === undefined ? {} : { structuredResult: result.structuredResult }),
  };
}
