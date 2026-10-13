import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createCliRuntime, type BuildContext, type BuiltCommand, type CliDeps, type CliSpec } from "./cli-runtime.js";
import { HERMES_RUNTIME_ID } from "./constants.js";
import type { ParsedRun } from "./parser.js";
import { createTextParser } from "./text-parse.js";
import type { WorkerRuntime } from "./types.js";

// Hermes through its one-shot mode (`hermes -z PROMPT`, verified against
// `hermes --help`, v0.21.7): prints only the final response. Its docs say
// approvals are auto-bypassed in this mode, so the runtime is marked
// selfApproving (card warning, no "Always"). `--usage-file PATH` makes Hermes
// write a JSON usage report even on failure. The report's field names are NOT
// verified against a real run (needs a configured provider); the reader below
// accepts several likely spellings and reports nothing when none match.
// The prompt must travel in argv (-z takes it as its value); it is redacted first.

const COMMAND = "hermes";
const USAGE_FILE = "usage.json";

const UsageReportSchema = z.object({
  model: z.string().optional(),
  input_tokens: z.number().optional(),
  prompt_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  estimated_cost: z.number().optional(),
  estimated_cost_usd: z.number().optional(),
  cost_usd: z.number().optional(),
}).passthrough();

type Report = z.infer<typeof UsageReportSchema>;

const firstNumber = (...values: Array<number | undefined>): number | undefined => values.find((v) => v !== undefined);

function usageFrom(report: Report): Partial<ParsedRun>["usage"] {
  const input = firstNumber(report.input_tokens, report.prompt_tokens);
  const output = firstNumber(report.output_tokens, report.completion_tokens);
  const cost = firstNumber(report.estimated_cost_usd, report.estimated_cost, report.cost_usd);
  if ([input, output, cost].every((v) => v === undefined)) return undefined;
  return {
    ...(input === undefined ? {} : { inputTokens: Math.round(input) }),
    ...(output === undefined ? {} : { outputTokens: Math.round(output) }),
    costUsd: cost ?? null,
  };
}

function readReport(raw: string): Report | null {
  try {
    const parsed = UsageReportSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseHermesUsage(raw: string): Partial<ParsedRun> {
  const report = readReport(raw);
  if (!report) return {};
  const usage = usageFrom(report);
  return { ...(report.model ? { model: report.model } : {}), ...(usage ? { usage } : {}) };
}

export function hermesArgs(context: BuildContext): string[] {
  const { input, scratchDir } = context;
  return [
    ...(input.ticket.model ? ["-m", input.ticket.model] : []),
    ...(scratchDir ? ["--usage-file", join(scratchDir, USAGE_FILE)] : []),
    "-z", context.prompt,
  ];
}

export const hermesSpec: CliSpec = {
  id: HERMES_RUNTIME_ID,
  displayName: "Hermes",
  command: COMMAND,
  selfApproving: true,
  detect: { runtimeId: HERMES_RUNTIME_ID, command: COMMAND, selfApproving: true, runVersion: true },
  build: (context): BuiltCommand => ({ args: hermesArgs(context) }),
  createParser: createTextParser,
  usesScratchDir: true,
  collect: async (dir) => parseHermesUsage(await readFile(join(dir, USAGE_FILE), "utf8").catch(() => "")),
};

export const createHermesRuntime = (deps: CliDeps): WorkerRuntime => createCliRuntime(hermesSpec, deps);
