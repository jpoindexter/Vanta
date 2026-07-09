import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunSetup } from "../session.js";
import type { SlashHandler } from "./types.js";

export type WorkflowState = "Run" | "Try" | "Setup";

export type CapabilityWorkflow = {
  id: string;
  title: string;
  outcome: string;
  example: string;
  command: string;
  setup: string;
  requires: string[];
  demo?: string;
};

export type WorkflowView = CapabilityWorkflow & {
  state: WorkflowState;
  missing: string[];
};

export type ColdActivationResult = {
  ok: boolean;
  workflowId?: string;
  workflowTitle?: string;
  elapsedMs: number;
  output: string;
};

export type FreshActivationReview = {
  reviewer: string;
  confusion: string;
  createdAt: string;
  workflowId?: string;
};

export const CAPABILITY_WORKFLOWS: CapabilityWorkflow[] = [
  {
    id: "fix-error",
    title: "Fix a pasted error",
    outcome: "Paste a terminal, build, MCP, or sandbox error and get the next command plus the file to inspect.",
    example: "mcp: terminal-love failed - mcp server exited (1)",
    command: `vanta run "Fix this error: <paste the error>"`,
    setup: "Shell, file reading, search, and edit tools are available.",
    requires: ["shell_cmd", "read_file", "grep_files", "edit_file"],
    demo: "fix-error",
  },
  {
    id: "continue-roadmap",
    title: "Continue the roadmap",
    outcome: "Pick the top build-order card, implement a verified slice, update the roadmap, commit, and push.",
    example: "Continue the activation roadmap until the next verified commit is pushed.",
    command: `vanta run "Continue the top roadmap item and push the slice"`,
    setup: "Shell, file reading/editing, and roadmap tools are available.",
    requires: ["shell_cmd", "read_file", "edit_file", "roadmap_move"],
    demo: "continue-roadmap",
  },
  {
    id: "spec-to-preview",
    title: "Turn a spec into a preview",
    outcome: "Convert a long app/product prompt into files, checks, and a local preview command.",
    example: "Build the posture routine app from this product spec...",
    command: `vanta run "Build this spec into a verified preview: <paste spec>"`,
    setup: "File writing/editing, shell, and file reading tools are available.",
    requires: ["write_file", "edit_file", "shell_cmd", "read_file"],
  },
  {
    id: "crash-log",
    title: "Diagnose a crash log",
    outcome: "Extract the likely cause, cite evidence lines, and return the repair command or Xcode/runtime fix.",
    example: "EXC_CRASH (SIGABRT), DYLD, Library not loaded: @rpath/lib_TestingInterop.dylib",
    command: `vanta run "Diagnose this crash log and give me the fix path: <paste report>"`,
    setup: "File reading, search, and shell tools are available.",
    requires: ["read_file", "grep_files", "shell_cmd"],
    demo: "crash-log",
  },
  {
    id: "research-receipts",
    title: "Research with receipts",
    outcome: "Break a question into subquestions, search, fetch sources, and return dated claims with citations.",
    example: "What changed in local agent sandboxes this month?",
    command: `/deep-research <question>`,
    setup: "Research, search, and source-fetch tools are available.",
    requires: ["research_decompose", "web_search", "web_fetch"],
  },
  {
    id: "remember-transcripts",
    title: "Remember transcript lessons",
    outcome: "Mine pasted transcript notes into durable memory and recall the relevant lesson later.",
    example: "From this transcript, remember the bug pattern and the recovery command.",
    command: `vanta run "Extract durable lessons from this transcript: <paste transcript>"`,
    setup: "Memory and recall tools are available.",
    requires: ["brain", "recall"],
  },
  {
    id: "watch-repo",
    title: "Watch this repo",
    outcome: "Set a scheduled check or background loop and wake you only when action is needed.",
    example: "Check this repo every morning for failing tests or stale roadmap items.",
    command: `vanta schedule "daily check this repo and tell me only if action is needed"`,
    setup: "Scheduling and shell tools are available.",
    requires: ["cron_create", "cron_list", "shell_cmd"],
  },
  {
    id: "delegate-work",
    title: "Send work to a helper",
    outcome: "Create or inspect background tasks, assign work, and collect the result without losing the main thread.",
    example: "Ask a helper to review the activation gallery while I keep coding.",
    command: `vanta agents`,
    setup: "Background work and chat handoff tools are available.",
    requires: ["team", "send_chat"],
  },
];

const DEMOS: Record<string, string> = {
  "fix-error": [
    "Demo: Fix a pasted error",
    "Fixture: start `python3 -m http.server 8123` with background:true while VANTA_SHELL_SANDBOX=1.",
    "Result: identify sandboxed background-server refusal; relaunch with `VANTA_SHELL_SANDBOX=0 vanta`; retry the server with background:true.",
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
  const setup = `\n     Needs: ${view.setup}`;
  const demo = view.demo ? `\n     Demo: /what-can-i-do --demo ${view.demo}` : "";
  return [
    `  ${index + 1}. [${view.state}] ${view.title}`,
    `     ${view.outcome}`,
    `     Example: ${view.example}`,
    `     Command: ${view.command}${setup}${demo}`,
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

function wantsCheck(arg: string): boolean {
  return arg.trim() === "--check";
}

function wantsReviewPacket(arg: string): boolean {
  return arg.trim() === "--review-packet";
}

function recordReviewText(arg: string): string | null {
  const m = arg.trim().match(/^--record-review\s+([\s\S]+)$/);
  return m?.[1]?.trim() || null;
}

export function runWorkflowDemo(id: string): string {
  return DEMOS[id] ?? `Unknown demo '${id}'. Available: ${Object.keys(DEMOS).join(", ")}`;
}

export function runColdActivationCheck(toolNames: Iterable<string>, now: () => Date = () => new Date()): ColdActivationResult {
  const started = now().getTime();
  const chosen = workflowViews(toolNames).find((view) => view.state !== "Setup" && view.demo);
  if (!chosen?.demo) {
    return {
      ok: false,
      elapsedMs: Math.max(0, now().getTime() - started),
      output: "Cold activation check: FAIL\nNo visible runnable workflow demo was available from the gallery.",
    };
  }
  const demo = runWorkflowDemo(chosen.demo);
  const elapsedMs = Math.max(0, now().getTime() - started);
  return {
    ok: true,
    workflowId: chosen.id,
    workflowTitle: chosen.title,
    elapsedMs,
    output: [
      "Cold activation check: PASS",
      `Picked: ${chosen.title}`,
      `Time-to-first-useful-action: ${elapsedMs}ms`,
      "",
      demo,
    ].join("\n"),
  };
}

export function formatFreshActivationReviewPacket(views: WorkflowView[]): string {
  const rows = views.map((v, i) => `  ${i + 1}. [${v.state}] ${v.title} — ${v.outcome}`);
  return [
    "Fresh-context activation review packet",
    "Reviewer stance: assume you have never seen this repo or Vanta's internals.",
    "",
    "Task",
    "  1. Run `vanta what-can-i-do` or type `/what-can-i-do` in Vanta.",
    "  2. Pick the first workflow that sounds useful without reading docs.",
    "  3. Try its demo or check path: `vanta what-can-i-do --check`.",
    "  4. Record the first confusion point, even if the run succeeds.",
    "",
    "Record",
    "  vanta what-can-i-do --record-review \"<first confusion point>\"",
    "  or: /what-can-i-do --record-review <first confusion point>",
    "",
    "Visible workflows",
    ...rows,
  ].join("\n");
}

export function buildFreshActivationReviewRecord(review: FreshActivationReview): string {
  return [
    "# Fresh-Context Activation Review",
    "",
    `- Reviewer: ${review.reviewer}`,
    `- Created: ${review.createdAt}`,
    review.workflowId ? `- Workflow: ${review.workflowId}` : "- Workflow: not recorded",
    "",
    "## First Confusion Point",
    "",
    review.confusion,
    "",
    "## Blocking Fix Required",
    "",
    "Treat this as blocking if it prevents a cold reviewer from reaching one useful workflow without knowing internal Vanta command names.",
  ].join("\n");
}

export async function recordFreshActivationReview(
  dataDir: string,
  review: Omit<FreshActivationReview, "createdAt">,
  now: () => Date = () => new Date(),
): Promise<string> {
  const createdAt = now().toISOString();
  const safeTs = createdAt.replace(/[:.]/g, "-");
  const dir = join(dataDir, "activation-reviews");
  const file = join(dir, `fresh-context-${safeTs}.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${buildFreshActivationReviewRecord({ ...review, createdAt })}\n`, "utf8");
  return file;
}

export const whatCanIDo: SlashHandler = async (arg, ctx) => {
  if (wantsCheck(arg)) {
    return { output: runColdActivationCheck(toolNamesFromSetup(ctx.setup), ctx.now).output };
  }
  if (wantsReviewPacket(arg)) {
    return { output: formatFreshActivationReviewPacket(workflowViews(toolNamesFromSetup(ctx.setup))) };
  }
  const reviewText = recordReviewText(arg);
  if (reviewText) {
    const file = await recordFreshActivationReview(ctx.dataDir, { reviewer: "fresh-context", confusion: reviewText }, ctx.now);
    return { output: `  ✓ fresh-context review recorded → ${file}` };
  }
  const id = demoId(arg);
  if (id) return { output: runWorkflowDemo(id) };
  return { output: formatWhatCanIDo(workflowViews(toolNamesFromSetup(ctx.setup))) };
};
