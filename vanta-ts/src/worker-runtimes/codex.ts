import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CODEX_RUNTIME_ID } from "./constants.js";
import { createCliRuntime, type BuildContext, type BuiltCommand, type CliDeps, type CliSpec } from "./cli-runtime.js";
import { createCodexParser } from "./codex-parse.js";
import type { WorkerRuntime } from "./types.js";

// Codex in exec mode. Flags verified against `codex exec --help` (0.144.1):
// --json (JSONL events), -s <sandbox>, -C <dir>, -m, -o <file>, and "-" to read
// the prompt from stdin. Codex's own sandbox stays on: workspace-write for edit
// access, read-only otherwise. Never --dangerously-bypass-approvals-and-sandbox.

const COMMAND = "codex";

const LAST_MESSAGE_FILE = "last-message.txt";
const lastMessageFile = (context: BuildContext): string | undefined => (context.scratchDir ? join(context.scratchDir, LAST_MESSAGE_FILE) : undefined);

function sandboxFor(context: BuildContext): "workspace-write" | "read-only" {
  return (context.input.access ?? "edit") === "edit" ? "workspace-write" : "read-only";
}

export function codexArgs(context: BuildContext): string[] {
  const { input } = context;
  const outputFile = lastMessageFile(context);
  return [
    "exec", "--json", "-s", sandboxFor(context), "-C", input.cwd,
    ...(input.ticket.model ? ["-m", input.ticket.model] : []),
    ...(outputFile ? ["-o", outputFile] : []),
    "-",
  ];
}

// `exec resume` has no -s flag; the sandbox is set through a config override.
export function codexResumeArgs(context: BuildContext & { sessionId: string }): string[] {
  const { input } = context;
  const outputFile = lastMessageFile(context);
  return [
    "exec", "resume", "--json", "-c", `sandbox_mode="${sandboxFor(context)}"`,
    ...(input.ticket.model ? ["-m", input.ticket.model] : []),
    ...(outputFile ? ["-o", outputFile] : []),
    context.sessionId, "-",
  ];
}

export const codexSpec: CliSpec = {
  id: CODEX_RUNTIME_ID,
  displayName: "Codex",
  command: COMMAND,
  selfApproving: false,
  detect: { runtimeId: CODEX_RUNTIME_ID, command: COMMAND, selfApproving: false, authArgs: ["login", "status"], runVersion: true },
  build: (context): BuiltCommand => ({ args: codexArgs(context), stdin: context.prompt }),
  buildResume: (context): BuiltCommand => ({ args: codexResumeArgs(context), stdin: context.prompt }),
  createParser: createCodexParser,
  usesScratchDir: true,
  collect: async (dir) => {
    const text = (await readFile(join(dir, LAST_MESSAGE_FILE), "utf8").catch(() => "")).trim();
    return text ? { finalMessage: text } : {};
  },
};

export const createCodexRuntime = (deps: CliDeps): WorkerRuntime => createCliRuntime(codexSpec, deps);
