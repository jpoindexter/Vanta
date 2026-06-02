import { writeSkill } from "../skills/store.js";

/**
 * A built-in business-operator mode: a named, installable skill whose body is a
 * real multi-step how-to an agent can follow. Installed into the skill store so
 * the existing `argo skill <name> "<instr>"` path can run it.
 */
export type OperatorMode = {
  name: string;
  description: string;
  body: string;
  tags: string[];
};

/**
 * The six operator modes. Each body is a numbered procedure that names real
 * Argo tools (read_file, web_search, web_fetch, run_code, git_status, git_diff,
 * lsp_diagnostics, write_skill) and enforces the two house rules: state the goal
 * before reaching for a tool, and verify the result before declaring done.
 */
export const OPERATOR_MODES: OperatorMode[] = [
  {
    name: "build-product-slice",
    description: "Ship one vertical slice: PRD to code to test to PR.",
    tags: ["mode", "product"],
    body: [
      "# Build Product Slice",
      "",
      "Goal first: write one sentence defining done (\"Done = X works for one user\"). If you cannot, stop and ask — do not open a tool yet.",
      "",
      "1. read_file the PRD/spec and any touched source so the change is grounded in real code, not assumptions.",
      "2. Identify the smallest vertical slice that satisfies the done sentence. Park everything else; do not generalise before three concrete uses.",
      "3. Write the failing test first (co-located *.test.ts), then the implementation. No stubs, no TODOs — real logic returning real values.",
      "4. run_code the test suite. Read the actual output; a green run is the only evidence the slice works.",
      "5. lsp_diagnostics the changed files; resolve every error before continuing.",
      "6. git_status then git_diff to confirm only the intended files changed and the diff matches the done sentence.",
      "7. Verify before done: re-read the done sentence and confirm each clause is demonstrably met by a test, not by hope.",
      "8. Open the PR with the done sentence as the summary and the test command as the verify step.",
      "9. write_skill any reusable procedure you discovered so the next slice is faster.",
    ].join("\n"),
  },
  {
    name: "research-to-offer",
    description: "Research a topic, synthesize it, draft a proposal, queue it.",
    tags: ["mode", "sales"],
    body: [
      "# Research To Offer",
      "",
      "Goal first: name the prospect and the single outcome the offer must promise. Without it, research has no target — define it before any search.",
      "",
      "1. web_search the topic with 3-5 focused queries; collect the most credible source URLs.",
      "2. web_fetch each chosen URL to read the full source, not just the snippet. Discard low-signal results.",
      "3. read_file any internal context (past proposals, capabilities) so the offer reflects what can actually be delivered.",
      "4. Synthesize findings into 3 concrete claims, each backed by a fetched source — no unsupported assertions.",
      "5. Draft the proposal: problem, the named outcome, approach, price, next step. One page, specific.",
      "6. Verify before done: every claim traces to a source and the offer maps to the outcome from step 0.",
      "7. Queue the draft for human approval — never send outreach autonomously.",
      "8. write_skill the winning research-and-draft pattern for reuse.",
    ].join("\n"),
  },
  {
    name: "weekly-review",
    description: "Review projects and goals, flag blockers, propose priorities.",
    tags: ["mode", "ops"],
    body: [
      "# Weekly Review",
      "",
      "Goal first: the output is a decision-ready status, not a data dump. Decide that before opening anything.",
      "",
      "1. inspect_state and read_file the active project/goal files to get current status from source, not memory.",
      "2. git_status across active repos to see uncommitted or stalled work.",
      "3. For each project, write one line: on-track / at-risk / blocked, with the evidence.",
      "4. Flag every blocker explicitly with its owner and the smallest unblocking action.",
      "5. Propose the top 3 priorities for the coming week, ordered, each tied to a goal.",
      "6. Verify before done: every status line cites real evidence and no active project is silently omitted.",
      "7. write_skill any recurring review step worth automating next week.",
    ].join("\n"),
  },
  {
    name: "revenue-push",
    description: "Pick a revenue action, draft outreach, queue for approval.",
    tags: ["mode", "revenue"],
    body: [
      "# Revenue Push",
      "",
      "Goal first: define the one revenue action with the highest expected value this week. Pick before drafting — do not scatter.",
      "",
      "1. read_file pipeline/CRM notes to ground the action in a real lead or opportunity.",
      "2. web_search the prospect or market only if context is missing; web_fetch to confirm specifics.",
      "3. Choose the single action: outreach, follow-up, upsell, or renewal — whichever moves money soonest.",
      "4. Draft the outreach: one clear ask, one reason it helps them, one next step. No filler.",
      "5. Verify before done: the message names a real recipient, a real value, and a concrete CTA.",
      "6. Queue the draft for human approval — revenue messages are never auto-sent.",
      "7. write_skill the outreach template if it is reusable across prospects.",
    ].join("\n"),
  },
  {
    name: "pre-ship-review",
    description: "Run checks, review the diff, propose a go/no-go decision.",
    tags: ["mode", "review"],
    body: [
      "# Pre-Ship Review",
      "",
      "Goal first: the output is a defensible go/no-go, not a vibe. Decide what 'go' requires before checking anything.",
      "",
      "1. git_diff to see exactly what is shipping; read every changed hunk.",
      "2. lsp_diagnostics the changed files; any error is an automatic no-go until fixed.",
      "3. run_code the full test suite and read the real output — claimed-passing is not passing.",
      "4. Scan the diff for stubs, secrets, TODOs, dead code, and files over the size limit.",
      "5. Confirm tests cover the new behaviour, not just that the old tests still pass.",
      "6. Verify before done: every check ran and produced evidence; nothing was skipped or assumed.",
      "7. Propose go or no-go with the evidence for each check and the blockers if no-go.",
    ].join("\n"),
  },
  {
    name: "inspect-opportunity",
    description: "Research a market, score the idea, draft a one-pager.",
    tags: ["mode", "strategy"],
    body: [
      "# Inspect Opportunity",
      "",
      "Goal first: state the idea in one sentence and the decision it informs (pursue / park / kill). Define it before researching.",
      "",
      "1. web_search the market for demand signals, incumbents, and pricing; gather credible URLs.",
      "2. web_fetch the strongest sources to read full context, not snippets.",
      "3. read_file any internal notes so the score reflects real capacity and fit.",
      "4. Score the idea on demand, competition, fit, and effort — each rated with its cited evidence.",
      "5. Draft a one-pager: problem, market, why-now, the score, and a recommendation.",
      "6. Verify before done: each score traces to a fetched source and the recommendation follows from the scores.",
      "7. write_skill the scoring rubric so future opportunities are judged consistently.",
    ].join("\n"),
  },
];

/**
 * Install every operator mode into the skill store. Each becomes a runnable
 * skill via `argo skill <name> "<instr>"`. Returns the installed skill names.
 */
export async function installModes(
  opts: { env?: NodeJS.ProcessEnv; now?: string } = {},
): Promise<string[]> {
  const names: string[] = [];
  for (const mode of OPERATOR_MODES) {
    const { skill } = await writeSkill(
      {
        name: mode.name,
        description: mode.description,
        body: mode.body,
        tags: mode.tags,
      },
      { env: opts.env, now: opts.now },
    );
    names.push(skill.meta.name);
  }
  return names;
}
