import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWorkflowGraph } from "../workflow/schema.js";
import { saveWorkflow } from "../workflow/composer-store.js";
import { runWorkflowGraph } from "../workflow/execute.js";
import { requestGraphRunControl } from "../workflow/run-control.js";
import { loadGraphRunState } from "../workflow/run-state-store.js";
import type { ToolContext } from "../tools/types.js";
import type { DesktopState } from "./handler-state.js";
import { workflowResumeSource } from "./workflow-resume-source.js";
import { resumeDesktopWorkflow } from "./workflow-resume.js";

const dispatch = vi.hoisted(() => vi.fn());
vi.mock("../agent/dispatch-tool.js", () => ({ dispatchTool: dispatch }));
vi.mock("./handler-conversation.js", () => ({ ensureDesktopConversation: async (state: DesktopState) => ({ ...state,
  setup: { provider: {}, safety: {}, registry: {} } }) }));
const allow = { risk: "allow" as const, needsHuman: false, reason: "test" };
const graph = parseWorkflowGraph({ id: "resume-proof", revision: 1, title: "Resume proof", start: "first", nodes: [
  { id: "first", type: "action", tool: "shell_cmd", args: { command: "first" }, sideEffect: true, approval: "never" },
  { id: "second", type: "action", tool: "shell_cmd", args: { command: "second" }, sideEffect: true, approval: "never" },
], transitions: [{ type: "next", from: "first", to: "second" }] });
beforeEach(() => { dispatch.mockReset(); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-resume-check-"));
  const dataDir = join(root, ".vanta");
  await saveWorkflow(dataDir, graph);
  await runWorkflowGraph(graph, { assess: async () => allow, requestApproval: async () => true,
    runAgent: async () => "unused", runTool: async () => {
      await requestGraphRunControl(dataDir, "paused", "pause");
      return "confirmed first effect";
    } }, { dataDir, runId: "paused" });
  const run = (await loadGraphRunState(dataDir, "paused"))!;
  let status = 0;
  let body: unknown;
  const res = { writeHead: (code: number) => { status = code; }, end: (value: string) => { body = JSON.parse(value); } } as unknown as http.ServerResponse;
  return { root, dataDir, run, res, reply: () => ({ status, body }) };
}

describe("desktop workflow resume", () => {
  it("dispatches once with fresh call identity, resumes only the missing step and retains budgets", async () => {
    const f = await fixture();
    const calls: string[] = [];
    dispatch.mockImplementation(async (call, _deps, ctx: ToolContext) => {
      expect(call.id).toMatch(/^desktop-workflow-resume:/);
      expect(call.arguments).toMatchObject({ run_id: "paused", resume: true });
      expect(ctx.effectAuthority).toBeUndefined();
      await ctx.onToolExecutionStart!(call);
      const result = await runWorkflowGraph(call.arguments.spec, { assess: async () => allow,
        requestApproval: async () => true, runAgent: async () => "unused",
        runTool: async node => { calls.push(node.id); return "confirmed second effect"; } }, { dataDir: f.dataDir, runId: "paused", resumePaused: true });
      return { ok: result.ok };
    });
    await resumeDesktopWorkflow({ root: f.root }, f.run, f.res);
    expect(f.reply()).toMatchObject({ status: 202, body: { status: "running" } });
    const final = await loadGraphRunState(f.dataDir, "paused");
    expect(final).toMatchObject({ status: "done", createdAt: f.run.createdAt, budget: { usedUsd: f.run.budget.usedUsd } });
    expect(calls).toEqual(["second"]);
    expect(final?.attempts.map(a => a.nodeId)).toEqual(["first", "second"]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps denial paused without consuming a retry or starting an executor", async () => {
    const f = await fixture();
    dispatch.mockResolvedValue({ ok: false, executed: false });
    await resumeDesktopWorkflow({ root: f.root }, f.run, f.res);
    expect(f.reply().status).toBe(403);
    expect(await loadGraphRunState(f.dataDir, "paused")).toEqual(f.run);
  });

  it("rejects changed source and uncertain terminal states without dispatch", async () => {
    const f = await fixture();
    await expect(workflowResumeSource(f.root, { ...f.run, graphHash: "0".repeat(64) }, { VANTA_HOME: join(f.root, "home") })).rejects.toThrow(/source/);
    await resumeDesktopWorkflow({ root: f.root }, { ...f.run, status: "error" }, f.res);
    expect(f.reply().status).toBe(409);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch again after an ambiguous failure and leaves an inspectable error", async () => {
    const f = await fixture();
    dispatch.mockImplementation(async (call, _deps, ctx: ToolContext) => { await ctx.onToolExecutionStart!(call); throw new Error("reset"); });
    await resumeDesktopWorkflow({ root: f.root }, f.run, f.res);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await loadGraphRunState(f.dataDir, "paused")).toMatchObject({ status: "error", terminal: { state: "failed" } });
  });

  it("rejects a second accepted start before it can duplicate execution", async () => {
    const f = await fixture();
    dispatch.mockImplementation(async (call, _deps, ctx: ToolContext) => {
      await requestGraphRunControl(f.dataDir, "paused", "retry");
      await ctx.onToolExecutionStart!(call);
    });
    await resumeDesktopWorkflow({ root: f.root }, f.run, f.res);
    expect(f.reply().status).toBe(409);
    expect((await loadGraphRunState(f.dataDir, "paused"))?.attempts).toEqual(f.run.attempts);
  });
});
