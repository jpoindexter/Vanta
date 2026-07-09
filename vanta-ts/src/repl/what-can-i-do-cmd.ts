import type { RunSetup } from "../session.js";
import type { SlashHandler } from "./types.js";

export type WorkflowState = "Run" | "Try" | "Setup";

export type CapabilityWorkflow = {
  id: string;
  title: string;
  outcome: string;
  example: string;
  command: string;
  requires: string[];
  demo?: string;
};

export type WorkflowView = CapabilityWorkflow & {
  state: WorkflowState;
  missing: string[];
};

export const CAPABILITY_WORKFLOWS: CapabilityWorkflow[] = [
  {
    id: "fix-error",
    title: "Fix a pasted error",
    outcome: "Paste a terminal, build, MCP, or sandbox error and get the next command plus the file to inspect.",
    example: "mcp: terminal-love failed - mcp server exited (1)",
    command: `vanta run "Fix this error: <paste the error>"`,
    requires: ["shell_cmd", "read_file", "grep_files", "edit_file"],
    demo: "fix-error",
  },
  {
    id: "continue-roadmap",
    title: "Continue the roadmap",
    outcome: "Pick the top build-order card, implement a verified slice, update the roadmap, commit, and push.",
    example: "Continue the activation roadmap until the next verified commit is pushed.",
    command: `vanta run "Continue the top roadmap item and push the slice"`,
    requires: ["shell_cmd", "read_file", "edit_file", "roadmap_move"],
    demo: "continue-roadmap",
  },
  {
    id: "spec-to-preview",
    title: "Turn a spec into a preview",
    outcome: "Convert a long app/product prompt into files, checks, and a local preview command.",
    example: "Build the posture routine app from this product spec...",
    command: `vanta run "Build this spec into a verified preview: <paste spec>"`,
    requires: ["write_file", "edit_file", "shell_cmd", "read_file"],
  },
  {
    id: "crash-log",
    title: "Diagnose a crash log",
    outcome: "Extract the likely cause, cite evidence lines, and return the repair command or Xcode/runtime fix.",
    example: "EXC_CRASH (SIGABRT), DYLD, Library not loaded: @rpath/lib_TestingInterop.dylib",
    command: `vanta run "Diagnose this crash log and give me the fix path: <paste report>"`,
    requires: ["read_file", "grep_files", "shell_cmd"],
    demo: "crash-log",
  },
  {
    id: "research-receipts",
    title: "Research with receipts",
    outcome: "Break a question into subquestions, search, fetch sources, and return dated claims with citations.",
    example: "What changed in local agent sandboxes this month?",
    command: `/deep-research <question>`,
    requires: ["research_decompose", "web_search", "web_fetch"],
  },
  {
    id: "remember-transcripts",
    title: "Remember transcript lessons",
    outcome: "Mine pasted transcript notes into durable memory and recall the relevant lesson later.",
    example: "From this transcript, remember the bug pattern and the recovery command.",
    command: `vanta run "Extract durable lessons from this transcript: <paste transcript>"`,
    requires: ["brain", "recall"],
  },
  {
    id: "watch-repo",
    title: "Watch this repo",
    outcome: "Set a scheduled check or background loop and wake you only when action is needed.",
    example: "Check this repo every morning for failing tests or stale roadmap items.",
    command: `vanta schedule "daily check this repo and tell me only if action is needed"`,
    requires: ["cron_create", "cron_list", "shell_cmd"],
  },
  {
    id: "delegate-work",
    title: "Delegate work to agents",
    outcome: "Create or inspect background tasks, assign work, and collect the result without losing the main thread.",
    example: "Ask a worker to review the activation gallery while I keep coding.",
    command: `vanta agents`,
    requires: ["team", "send_chat"],
  },
];

const DEMOS: Record<string, string> = {
  "fix-error": [
    "Demo: Fix a pasted error",
    "Input: refused: background tasks are not sandboxed under sandbox mode.",
    "Result: identify sandboxed background refusal; relaunch with `VANTA_SHELL_SANDBOX=0 vanta`; retry long-running server commands with background:true.",
    `Command: ${CAPABILITY_WORKFLOWS[0]!.command}`,
  ].join("\n"),
  "continue-roadmap": [
    "Demo: Continue the roadmap",
    "Input: Current build order starts with SANDBOX-SCOPE-WIZARD and WHAT-CAN-I-DO-GALLERY.",
    "Result: pick the first feasible card, implement a focused verified slice, update roadmap notes, commit, and push.",
    `Command: ${CAPABILITY_WORKFLOWS[1]!.command}`,
  ].join("\n"),
  "crash-log": [
    "Demo: Diagnose a crash log",
    "Input: DYLD Code 1, Library not loaded: @rpath/lib_TestingInterop.dylib.",
    "Result: name the missing dynamic library as the likely cause, cite the DYLD lines, and suggest repairing the XCTest/test-runtime search path.",
    `Command: ${CAPABILITY_WORKFLOWS[3]!.command}`,
  ].join("\n"),
};

function stateForWorkflow(workflow: CapabilityWorkflow, tools: Set<string>): WorkflowState {
  const available = workflow.requires.filter((name) => tools.has(name)).length;
  if (available === workflow.requires.length) return "Run";
  return available > 0 ? "Try" : "Setup";
}

export function workflowViews(toolNames: Iterable<string>): WorkflowView[] {
  const tools = new Set(toolNames);
  return CAPABILITY_WORKFLOWS.map((workflow) => ({
    ...workflow,
    state: stateForWorkflow(workflow, tools),
    missing: workflow.requires.filter((name) => !tools.has(name)),
  }));
}

export function toolNamesFromSetup(setup: RunSetup): string[] {
  return setup.registry.schemas().map((schema) => schema.name);
}

function formatWorkflow(view: WorkflowView, index: number): string {
  const missing = view.missing.length ? `\n     Missing: ${view.missing.join(", ")}` : "";
  const demo = view.demo ? `\n     Demo: /what-can-i-do --demo ${view.demo}` : "";
  return [
    `  ${index + 1}. [${view.state}] ${view.title}`,
    `     ${view.outcome}`,
    `     Example: ${view.example}`,
    `     Command: ${view.command}${demo}${missing}`,
  ].join("\n");
}

export function formatWhatCanIDo(views: WorkflowView[]): string {
  const counts = views.reduce<Record<WorkflowState, number>>((acc, view) => {
    acc[view.state] += 1;
    return acc;
  }, { Run: 0, Try: 0, Setup: 0 });
  return [
    "What Vanta can do now",
    `Run ${counts.Run} · Try ${counts.Try} · Setup ${counts.Setup}`,
    "",
    ...views.map(formatWorkflow),
  ].join("\n");
}

function demoId(arg: string): string | null {
  const m = arg.trim().match(/^--demo\s+(\S+)$/);
  return m?.[1] ?? null;
}

export function runWorkflowDemo(id: string): string {
  return DEMOS[id] ?? `Unknown demo '${id}'. Available: ${Object.keys(DEMOS).join(", ")}`;
}

export const whatCanIDo: SlashHandler = (arg, ctx) => {
  const id = demoId(arg);
  if (id) return { output: runWorkflowDemo(id) };
  return { output: formatWhatCanIDo(workflowViews(toolNamesFromSetup(ctx.setup))) };
};
