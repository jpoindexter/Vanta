import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentsCommand } from "./agents-cmd.js";
import { recordDelegationNode } from "../subagent/delegation-receipt.js";
import { startWorkerInspection } from "../subagent/worker-inspection.js";
import { readTasks } from "../team/tasks.js";
import type { AgentOutcome } from "../agent.js";
import type { Message } from "../types.js";

let root: string;
let home: string;
const id = "owned-child";
const checkpoint = () => join(root, ".vanta", "sidechains", `worker-${id}.json`);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-delegation-recovery-"));
  home = await mkdtemp(join(tmpdir(), "vanta-delegation-home-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function seed(outcome?: AgentOutcome, messages: Message[] = [{ role: "assistant", content: "Partial fixture" }], parentId = "owned-parent", stoppedReason = "done") {
  const store = await startWorkerInspection({ id, root, workerRoot: root, parentSessionId: "owned-parent",
    goal: "Research", instruction: "Read the fixture", agentType: "fixture", model: "offline", declaredMaxIterations: 3 });
  if (outcome) await store.finish(messages, outcome);
  await recordDelegationNode(root, { id, treeId: "owned-parent", parentId, parentTask: "Research",
    childPrompt: "Read the fixture", model: "offline", tools: [], summary: "Partial fixture",
    rawSidechain: join(root, ".vanta", "sidechains", "fixture.json"), verification: "pass", stoppedReason,
    durationMs: 1, createdAt: new Date().toISOString() });
}

const cleanOutcome: AgentOutcome = { finalText: "Fixture", stoppedReason: "done", iterations: 1, toolIterations: 1 };
const call = (effectState?: "pending" | "started", name = "write_file"): Message => ({ role: "assistant", content: "",
  toolCalls: [{ id: "call-1", name, arguments: {}, ...(effectState ? { effectState } : {}) }] });

async function control(args: string[] = ["delegation", "replay", id]) {
  const before = await readFile(checkpoint());
  const logs: string[] = [];
  const code = await runAgentsCommand(root, args, { env: { VANTA_HOME: home }, log: line => logs.push(line) });
  expect(await readFile(checkpoint())).toEqual(before);
  return { code, tasks: await readTasks({ VANTA_HOME: home }), output: logs.join("\n") };
}

describe("delegation recovery admission", () => {
  it.each(["replay", "follow-up"])("does not queue %s of a child with unresolved effect review", async action => {
    await seed({ finalText: "Review uncertain effect", stoppedReason: "blocked", iterations: 1, toolIterations: 1,
      needsEffectReview: true, effectReviewCallIds: ["uncertain-call"], completionState: "needs human" });
    const before = await readFile(checkpoint());
    const logs: string[] = [];
    const code = await runAgentsCommand(root, ["delegation", action, id, "Check result"], {
      env: { VANTA_HOME: home }, log: line => logs.push(line),
    });
    const queued = await readTasks({ VANTA_HOME: home });
    expect(queued).toEqual([]);
    expect(code).toBe(1);
    expect(await readFile(checkpoint())).toEqual(before);
    expect(logs.join("\n")).toContain("review");
  });

  it.each([
    { label: "unknown result", messages: [call("started"), { role: "tool", toolCallId: "call-1", name: "write_file", content: "Uncertain", effectDisposition: "unknown" }] },
    { label: "legacy mutator result without disposition", messages: [call("started"), { role: "tool", toolCallId: "call-1", name: "write_file", content: "Legacy result" }] },
    { label: "unanswered started mutator", messages: [call("started")] },
    { label: "unanswered legacy mutator", messages: [call()] },
  ] satisfies Array<{ label: string; messages: Message[] }>)("holds $label without appending a task", async ({ messages }) => {
    await seed(cleanOutcome, messages);
    const result = await control();
    expect(result.code).toBe(1);
    expect(result.tasks).toEqual([]);
    expect(result.output).toContain("prior effects are unresolved");
  });

  it.each([
    { label: "settled started mutator", messages: [call("started"), { role: "tool", toolCallId: "call-1", name: "write_file", content: "Recorded", effectDisposition: "confirmed" }] },
    { label: "explicit pending mutator", messages: [call("pending")] },
    { label: "unanswered read", messages: [call("started", "read_file")] },
    { label: "legacy read result", messages: [call("started", "read_file"), { role: "tool", toolCallId: "call-1", name: "read_file", content: "Read only" }] },
  ] satisfies Array<{ label: string; messages: Message[] }>)("allows a fresh follow-up for $label, not recovered authority", async ({ messages }) => {
    await seed(cleanOutcome, messages);
    const result = await control(["delegation", "follow-up", id, "Check the fixture"]);
    expect(result.code).toBe(0);
    expect(result.tasks).toHaveLength(1);
    expect(result.output).toContain("Fresh task only");
    expect(result.output).toContain("no stored transcript, remaining budget, or prior approvals restored");
  });

  it("holds a conflicting recorded parent", async () => {
    await seed(cleanOutcome, [], "foreign-parent");
    const result = await control();
    expect(result.code).toBe(1);
    expect(result.tasks).toEqual([]);
    expect(result.output).toContain("parent conflicts");
  });

  it("holds an unfinished checkpoint rather than deriving work from a stale receipt", async () => {
    await seed();
    const result = await control();
    expect(result.code).toBe(1);
    expect(result.tasks).toEqual([]);
    expect(result.output).toContain("worker is unfinished");
  });

  it("does not queue work when the checkpoint is corrupt", async () => {
    await seed(cleanOutcome);
    await writeFile(checkpoint(), "{corrupt");
    const result = await control();
    expect(result.code).toBe(1);
    expect(result.tasks).toEqual([]);
    expect(result.output).toContain("checkpoint is invalid");
  });

  it("holds a contradictory legacy receipt without a checkpoint", async () => {
    await seed(cleanOutcome, [], "owned-parent", "blocked");
    await rm(checkpoint());
    const logs: string[] = [];
    expect(await runAgentsCommand(root, ["delegation", "replay", id], { env: { VANTA_HOME: home }, log: line => logs.push(line) })).toBe(1);
    expect(await readTasks({ VANTA_HOME: home })).toEqual([]);
    expect(logs.join("\n")).toContain("legacy result has no checkpoint");
  });
});
