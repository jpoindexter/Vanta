import { join } from "node:path";
import type { FactoryPlan, SliceArtifact } from "./types.js";

// --- Pure helpers ---

/**
 * Read CLAUDE.md from each directory in `dirs` (relative to `root`).
 * Returns the file contents for dirs that have one; silently skips missing ones.
 */
export async function readDirContexts(root: string, dirs: string[]): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const results: string[] = [];
  for (const dir of dirs) {
    const claudePath = join(root, dir, "CLAUDE.md");
    const content = await readFile(claudePath, "utf8").catch(() => null);
    if (content) results.push(content.trim());
  }
  return results;
}

/** Build the agent instruction for a factory execution cycle. */
export function buildFactoryInstruction(plan: FactoryPlan, budgetTokens: number, dirContexts: string[] = []): string {
  const dirs = plan.touchedDirs.length ? plan.touchedDirs.join(", ") : "any folder you modify";
  const contextBlock = dirContexts.length
    ? [`--- Directory context (from CLAUDE.md files) ---`, ...dirContexts, `--- End context ---`, ``].join("\n")
    : "";
  return [
    contextBlock,
    `Factory cycle — implement the following slice as a single self-contained unit:`,
    ``,
    plan.instruction,
    ``,
    `Requirements (non-negotiable):`,
    `1. Write a co-located test in the same directory as your implementation (foo.ts → foo.test.ts).`,
    `2. Tests must actually exercise the new code — not trivially pass on any input.`,
    `3. After writing code, run: cd argo-ts && npx vitest run <new-test-file> to confirm tests pass.`,
    `4. After running tests, run: npx tsc --noEmit to confirm clean types.`,
    `5. Update or create CLAUDE.md and AGENTS.md in: ${dirs} — one-line purpose + file list.`,
    `6. Budget: ${budgetTokens} output tokens for this cycle. Be concise. Prefer local Ollama via delegate for simple subtasks.`,
    `7. Do not commit — the factory orchestrator commits after verification.`,
  ].join("\n");
}

/** Parse `git diff --name-only` or `git ls-files --others` stdout into file paths. */
export function parseTouchedFiles(stdout: string): string[] {
  return stdout.trim().split("\n").filter(Boolean);
}

// --- I/O ---

/**
 * Run the executor agent with the factory plan. Returns the slice artifact
 * (list of touched files + token spend) for the verifier.
 */
export async function execute(
  root: string,
  plan: FactoryPlan,
  budgetTokens: number,
): Promise<SliceArtifact> {
  const { createConversation } = await import("../agent.js");
  const { prepareRun, buildSummarizer } = await import("../session.js");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  const dirContexts = await readDirContexts(root, plan.touchedDirs);
  const instruction = buildFactoryInstruction(plan, budgetTokens, dirContexts);
  const setup = await prepareRun(root, instruction);

  let outputTokens = 0;
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root,
    requestApproval: async () => false, // protected paths already blocked by kernel
    maxIterations: 40,
    summarize: buildSummarizer(setup.provider),
  });

  const outcome = await convo.send(instruction);
  outputTokens = outcome.usage?.outputTokens ?? 0;

  // Harvest all files changed or added since branch creation
  const diffOut = await exec("git", ["diff", "--name-only", "HEAD"], { cwd: root }).catch(() => ({ stdout: "" }));
  const untrackedOut = await exec("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root }).catch(() => ({ stdout: "" }));
  const touchedFiles = parseTouchedFiles(diffOut.stdout + "\n" + untrackedOut.stdout);

  return { newTestFiles: [], touchedFiles, tokenSpend: outputTokens };
}
