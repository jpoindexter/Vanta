import type { WorkItem, FactoryPlan } from "./types.js";

/** Build the agent instruction for a given work item. Pure — no I/O. */
export function buildPlan(item: WorkItem, root: string): FactoryPlan {
  return {
    workItem: item,
    instruction: buildInstruction(item, root),
    touchedDirs: inferTouchedDirs(item, root),
  };
}

const PROVEN_PATTERNS = [
  `PROVEN-PATTERNS (apply to this slice; spec overrides on conflict):`,
  `- Max 300 lines per new file. If a unit needs more, split it.`,
  `- One concern per file. Name describes the single responsibility (≤ 4 words).`,
  `- Registry-by-default: new tool = new file (tools/<name>.ts) + one entry in ALL_TOOLS registry (tools/index.ts). No switch edits.`,
  `- Every new .ts file gets a co-located .test.ts. Tests name the behavior, not the implementation.`,
  `- Errors as values: return { ok, output } — never throw across module boundaries.`,
  `- Zod at every LLM/API boundary. No \`any\` — use \`unknown\` + narrowing.`,
].join("\n");

function buildInstruction(item: WorkItem, root: string): string {
  const tsRoot = `${root}/argo-ts`;
  switch (item.category) {
    case "roadmap":
      return [
        PROVEN_PATTERNS,
        ``,
        `ROADMAP item: "${item.description}"`,
        ``,
        `Implement this item in the Argo TypeScript layer (${tsRoot}/src/).`,
        `1. Identify the right file(s) to add or modify.`,
        `2. Write the implementation with a co-located test (same directory, foo.ts → foo.test.ts).`,
        `3. Run the new tests: cd ${tsRoot} && npx vitest run <test-file>`,
        `4. Run tsc: npx tsc --noEmit (must be clean)`,
        `5. Do not commit — the factory orchestrator commits after verification.`,
      ].join("\n");

    case "parked":
      return [
        PROVEN_PATTERNS,
        ``,
        `PARKED idea to promote: "${item.description}"`,
        ``,
        `Assess if this is now feasible and small enough for one slice.`,
        `If yes: implement the smallest working version with tests.`,
        `If no: respond with "SKIP: <reason>" and stop without writing code.`,
        `Do not commit.`,
      ].join("\n");

    case "test-failure":
      return [
        `Fix failing test: ${item.hint ?? item.description}`,
        `Failing file: ${item.targetFile ?? "(unknown)"}`,
        ``,
        `1. Read the failing test to understand what it expects.`,
        `2. Fix the implementation (not the test) to make it pass.`,
        `3. Run: cd ${tsRoot} && npx vitest run ${item.targetFile ?? ""}`,
        `4. Run: npx tsc --noEmit`,
        `5. Do not commit.`,
      ].join("\n");

    case "type-error":
      return [
        `Fix TypeScript type error: ${item.hint ?? item.description}`,
        `File: ${item.targetFile ?? "(see tsc output)"}`,
        ``,
        `1. Fix the type error without using \`any\` or \`@ts-ignore\`.`,
        `2. Run: cd ${tsRoot} && npx tsc --noEmit (must be clean)`,
        `3. Run: npx vitest run (full suite must pass)`,
        `4. Do not commit.`,
      ].join("\n");

    case "quality":
      return [
        `Code quality fix: ${item.description}`,
        `File: ${item.targetFile ?? "(see description)"}`,
        ``,
        `1. Fix the quality issue (file too large → split; function too complex → simplify).`,
        `2. All existing tests must still pass after the refactor.`,
        `3. Run: cd ${tsRoot} && npx vitest run && npx tsc --noEmit`,
        `4. Do not commit.`,
      ].join("\n");
  }
}

function inferTouchedDirs(item: WorkItem, root: string): string[] {
  const tsRoot = `${root}/argo-ts`;
  if (item.targetFile) {
    const parts = item.targetFile.split("/");
    const dir = parts.slice(0, -1).join("/");
    return [dir ? `${tsRoot}/${dir}` : `${tsRoot}/src`];
  }
  return [`${tsRoot}/src`];
}
