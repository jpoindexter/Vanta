import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { createCliRuntime, type BuildContext, type BuiltCommand, type CliDeps, type CliSpec } from "./cli-runtime.js";
import { CLAUDE_RUNTIME_ID, CODEX_RUNTIME_ID, HERMES_RUNTIME_ID, NATIVE_RUNTIME_ID } from "./constants.js";
import { createTextParser } from "./text-parse.js";
import { RuntimeIdSchema, type WorkerRuntime } from "./types.js";

// User-declared CLIs: ~/.vanta/agents.json, the same file call_agent reads.
//   { "agents": { "aider": { "cmd": "aider", "args": ["--message", "{prompt}"], "modelFlag": "--model" } } }
// This reader accepts the same entries and adds two optional fields:
//   "promptVia": "stdin"      send the prompt on stdin instead of in argv
//   "selfApproving": false    declare that the CLI cannot act without asking (default true)
// A declared CLI is never executed to probe it; detection only checks PATH.

const RESERVED = new Set([CLAUDE_RUNTIME_ID, CODEX_RUNTIME_ID, HERMES_RUNTIME_ID, NATIVE_RUNTIME_ID]);

export const CustomCliEntrySchema = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()),
  modelFlag: z.string().optional(),
  promptVia: z.enum(["argv", "stdin"]).default("argv"),
  selfApproving: z.boolean().default(true),
});
export type CustomCliEntry = z.infer<typeof CustomCliEntrySchema>;

export async function loadCustomCliEntries(env: NodeJS.ProcessEnv): Promise<Map<string, CustomCliEntry>> {
  const out = new Map<string, CustomCliEntry>();
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(resolveVantaHome(env), "agents.json"), "utf8"));
  } catch {
    return out;
  }
  const agents = (raw as { agents?: unknown } | null)?.agents;
  if (!agents || typeof agents !== "object") return out;
  for (const [name, value] of Object.entries(agents)) {
    const id = RuntimeIdSchema.safeParse(name);
    const entry = CustomCliEntrySchema.safeParse(value);
    if (id.success && entry.success && !RESERVED.has(id.data)) out.set(id.data, entry.data);
  }
  return out;
}

function substitute(entry: CustomCliEntry, context: BuildContext): string[] {
  const model = context.input.ticket.model ?? "";
  const prompt = entry.promptVia === "argv" ? context.prompt : "";
  return [
    ...(model && entry.modelFlag ? [entry.modelFlag, model] : []),
    ...entry.args.map((arg) => arg.replace("{prompt}", prompt).replace("{model}", model)),
  ];
}

export function customCliSpec(id: string, entry: CustomCliEntry): CliSpec {
  return {
    id,
    displayName: id,
    command: entry.cmd,
    selfApproving: entry.selfApproving,
    detect: { runtimeId: id, command: entry.cmd, selfApproving: entry.selfApproving, runVersion: false },
    build: (context): BuiltCommand => ({ args: substitute(entry, context), ...(entry.promptVia === "stdin" ? { stdin: context.prompt } : {}) }),
    createParser: createTextParser,
  };
}

export const createCustomCliRuntime = (id: string, entry: CustomCliEntry, deps: CliDeps): WorkerRuntime => createCliRuntime(customCliSpec(id, entry), deps);
