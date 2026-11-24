import { CLAUDE_RUNTIME_ID } from "./constants.js";
import { createClaudeParser } from "./claude-parse.js";
import { createCliRuntime, type BuildContext, type BuiltCommand, type CliDeps, type CliSpec } from "./cli-runtime.js";
import type { WorkerRuntime } from "./types.js";

// Claude Code in headless print mode. Flags verified against `claude --help`
// (2.1.222): -p, --output-format stream-json (needs --verbose), --permission-mode,
// --model, --max-budget-usd, --resume. The prompt goes on stdin, not argv.
// Edit access uses acceptEdits (file edits only; other tools are denied because
// nothing can answer a prompt). Read-only uses plan mode. Never
// --dangerously-skip-permissions: that is only used by the Docker-boxed call_agent path.

const COMMAND = "claude";

export function claudeArgs(context: BuildContext): string[] {
  const { input } = context;
  const mode = (input.access ?? "edit") === "edit" ? "acceptEdits" : "plan";
  const budget = input.maxBudgetUsd !== undefined && input.maxBudgetUsd > 0 ? ["--max-budget-usd", String(Math.round(input.maxBudgetUsd * 10_000) / 10_000)] : [];
  return [
    "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", mode,
    ...(input.ticket.model ? ["--model", input.ticket.model] : []),
    ...budget,
  ];
}

const build = (context: BuildContext): BuiltCommand => ({ args: claudeArgs(context), stdin: context.prompt });
const buildResume = (context: BuildContext & { sessionId: string }): BuiltCommand => ({ args: [...claudeArgs(context), "--resume", context.sessionId], stdin: context.prompt });

export const claudeSpec: CliSpec = {
  id: CLAUDE_RUNTIME_ID,
  displayName: "Claude Code",
  command: COMMAND,
  selfApproving: false,
  detect: { runtimeId: CLAUDE_RUNTIME_ID, command: COMMAND, selfApproving: false, authArgs: ["auth", "status"], runVersion: true },
  build,
  buildResume,
  createParser: createClaudeParser,
};

export const createClaudeCodeRuntime = (deps: CliDeps): WorkerRuntime => createCliRuntime(claudeSpec, deps);
