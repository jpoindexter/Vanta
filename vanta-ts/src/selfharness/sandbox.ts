import { z } from "zod";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

// Config-change sandbox CORE: run a SAVED input end-to-end against a CANDIDATE
// config override (prompt prefix / model / provider / tool subset) in isolation,
// capture a comparable trace, and diff it against a baseline (default config) run.
// Pure + dependency-injected — NO LLM, NO network, NO registry/provider imports
// here (those live in the tool wiring, tools/config-sandbox.ts) so this module
// stays free of the tool-registry import cycle and fully unit-testable. The
// injected runner is the only side-effecting dep; the sandbox itself never calls
// git.

export const SandboxInputSchema = z.object({
  name: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, "name must be filename-safe (A-Z a-z 0-9 _ -)"),
  instruction: z.string().min(1),
});
export type SandboxInput = z.infer<typeof SandboxInputSchema>;

export const ConfigOverrideSchema = z.object({
  promptPrefix: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  toolNames: z.array(z.string().min(1)).min(1).optional(),
});
export type ConfigOverride = z.infer<typeof ConfigOverrideSchema>;

export type Trace = { finalText: string; toolCalls: string[]; stoppedReason: string };
export type SandboxComparison = {
  input: SandboxInput;
  candidate: Trace;
  baseline: Trace;
  diff: { toolCallsDelta: number; sameOutcome: boolean };
};

/** A run of one config against one instruction. Injected so the orchestration is
 *  fully testable; the tool wires a real `spawnSubagent`-backed runner. */
export type SandboxRunner = (args: { instruction: string; override: ConfigOverride }) => Promise<Trace>;

export type SandboxDeps = { runner: SandboxRunner };

const INPUTS_SUBDIR = ["sandbox", "inputs"] as const;

function inputPath(dataDir: string, name: string): string {
  return join(dataDir, ...INPUTS_SUBDIR, `${name}.json`);
}

/** Persist a saved input under `.vanta/sandbox/inputs/<name>.json`. */
export async function saveSandboxInput(dataDir: string, input: SandboxInput): Promise<string> {
  const parsed = SandboxInputSchema.parse(input);
  const file = inputPath(dataDir, parsed.name);
  await mkdir(join(dataDir, ...INPUTS_SUBDIR), { recursive: true });
  await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return file;
}

/** Load a saved input. Throws a clear error if missing or malformed. */
export async function loadSandboxInput(dataDir: string, name: string): Promise<SandboxInput> {
  const file = inputPath(dataDir, name);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`no saved sandbox input "${name}" at ${file} — save one first`);
  }
  return SandboxInputSchema.parse(JSON.parse(raw));
}

/** Wrap the override's system-prompt prefix onto a base instruction. */
export function applyPromptPrefix(instruction: string, prefix?: string): string {
  return prefix ? `${prefix}\n\n${instruction}` : instruction;
}

function computeDiff(candidate: Trace, baseline: Trace): SandboxComparison["diff"] {
  return {
    toolCallsDelta: candidate.toolCalls.length - baseline.toolCalls.length,
    sameOutcome: candidate.finalText.trim() === baseline.finalText.trim(),
  };
}

/**
 * Run the candidate config + a baseline (default config) against the same saved
 * input, in isolation, and return a side-by-side comparison. No git mutation.
 */
export async function runSandbox(args: {
  input: SandboxInput;
  override: ConfigOverride;
  deps: SandboxDeps;
  baseline?: ConfigOverride;
}): Promise<SandboxComparison> {
  const input = SandboxInputSchema.parse(args.input);
  const override = ConfigOverrideSchema.parse(args.override);
  const baseline = ConfigOverrideSchema.parse(args.baseline ?? {});
  const candidateTrace = await args.deps.runner({ instruction: input.instruction, override });
  const baselineTrace = await args.deps.runner({ instruction: input.instruction, override: baseline });
  return {
    input,
    candidate: candidateTrace,
    baseline: baselineTrace,
    diff: computeDiff(candidateTrace, baselineTrace),
  };
}

function describeOverride(o: ConfigOverride): string {
  const parts: string[] = [];
  if (o.provider) parts.push(`provider=${o.provider}`);
  if (o.model) parts.push(`model=${o.model}`);
  if (o.toolNames?.length) parts.push(`tools=[${o.toolNames.join(", ")}]`);
  if (o.promptPrefix) parts.push("prompt-prefix");
  return parts.length ? parts.join(" ") : "default config";
}

function traceLines(label: string, trace: Trace, override: ConfigOverride): string[] {
  return [
    `${label} (${describeOverride(override)})`,
    `  stopped: ${trace.stoppedReason}`,
    `  tools (${trace.toolCalls.length}): ${trace.toolCalls.join(", ") || "—"}`,
    `  final: ${trace.finalText.trim() || "—"}`,
  ];
}

/** A readable side-by-side comparison text block (pure). */
export function formatComparison(cmp: SandboxComparison, override?: ConfigOverride): string {
  const ov = override ?? ConfigOverrideSchema.parse({});
  const sign = cmp.diff.toolCallsDelta > 0 ? "+" : "";
  return [
    `Sandbox comparison — input "${cmp.input.name}" (no git mutation)`,
    "",
    ...traceLines("CANDIDATE", cmp.candidate, ov),
    "",
    ...traceLines("BASELINE", cmp.baseline, ConfigOverrideSchema.parse({})),
    "",
    `diff: tool-calls ${sign}${cmp.diff.toolCallsDelta} vs baseline · outcome ${cmp.diff.sameOutcome ? "same" : "different"}`,
  ].join("\n");
}
