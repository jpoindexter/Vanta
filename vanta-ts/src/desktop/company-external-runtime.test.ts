import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRules } from "../permissions/store.js";
import { resetCompanyPorts, setCompanyPorts } from "./company-ports.js";
import { selectRuntime } from "./company-run-select.js";
import { settleRuns } from "./company-run-state.js";
import { startCompanyHarness, type CompanyHarness } from "./__fixtures__/company-harness.js";
import { externalKit, initProjectRepo, installFakeClis, nextApproval, answerApproval, type ExternalKit } from "./__fixtures__/company-external.js";
import { hireDev } from "./__fixtures__/company-helpers.js";
import { writeFileSync } from "node:fs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../worker-runtimes/__fixtures__");
const lines = (name: string): string[] => readFileSync(join(fixtures, name), "utf8").split("\n").filter(Boolean);
const P = "/api/company";

let h: CompanyHarness;
beforeEach(async () => {
  h = await startCompanyHarness();
  initProjectRepo(h.root);
  installFakeClis(h);
});
afterEach(async () => {
  await settleRuns();
  resetCompanyPorts();
  await h.close();
});

function useKit(kit: ExternalKit): void {
  setCompanyPorts({ runtime: (state, worker) => selectRuntime(state, worker, kit.seams), runtimeSeams: kit.seams });
}

async function ticketFor(id: string, title: string, extra: Record<string, unknown> = {}): Promise<void> {
  await h.post(`${P}/tickets/create`, { title, ...extra });
  await h.post(`${P}/tickets/assign`, { ticketId: id, workerId: "engineer" });
}

describe("ticket dispatched to a Claude Code worker", () => {
  it("goes ticket, assign, approval card, run, work products, usage, approve, close", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-success.jsonl"), run: () => writeFileSync(join(h.root, "NOTES.md"), "hello\n") });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code", budgetUsd: 5 });
    expect((await h.get("/api/company")).body.workers[0].runtime).toMatchObject({ kind: "claude-code", adapter: "cli:claude-code" });

    await h.post(`${P}/tickets/create`, { title: "Write notes", expectedOutput: "report" });
    const assigned = await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    expect(assigned.body.run.started).toBe(true);

    const card = await nextApproval(h);
    expect(card.toolName).toBe("call_agent");
    expect(card.action).toContain("Claude Code (claude)");
    expect(card.action).toContain(`ticket T-1 in ${h.root}`);
    expect(card.request.canRemember).toBe(true);
    expect(card.request.sections.find((s) => s.label === "Preview")?.value).toContain("Write notes");
    expect(kit.launches).toHaveLength(0);
    await answerApproval(h, card.id, "allow");
    await settleRuns();

    const launch = kit.launches[0]!;
    expect(launch.cmd).toBe("claude");
    expect(launch.cwd).toBe(h.root);
    expect(launch.args).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--permission-mode", "acceptEdits", "--max-budget-usd", "5"]));
    expect(launch.args.join(" ")).not.toContain("Write notes");
    expect(launch.stdin).toContain("Ticket T-1: Write notes");
    expect(kit.assessed.some((a) => a.startsWith("launch Claude Code"))).toBe(true);

    const ticket = (await h.get("/api/tickets/T-1")).body;
    expect(ticket).toMatchObject({ status: "in_review", workProductCount: 2, pendingReviews: 1 });
    expect(ticket.runs[0]).toMatchObject({ runtime: "claude-code", status: "awaiting_review", costUsd: 0.0412, costBasis: "reported", usage: { inputTokens: 4620, outputTokens: 240 }, model: "claude-sonnet-4-5", provider: "claude-code" });
    expect(ticket.workProducts.map((p: { kind: string }) => p.kind).sort()).toEqual(["code", "report"]);
    const runId = ticket.runs[0].runId;
    for (const product of ticket.workProducts) expect(product.provenance).toMatchObject({ taskId: "T-1", workerId: "engineer", runtimeId: "claude-code", runId });
    expect(ticket.workProducts.find((p: { kind: string }) => p.kind === "code").artifact).toContain("NOTES.md");

    const budgets = (await h.get("/api/budgets")).body;
    expect(budgets.workers[0]).toMatchObject({ scope: "agent:engineer", reportedUsd: 0.0412 });
    expect((await h.get("/api/company")).body.workers[0]).toMatchObject({ costUsd: 0.0412, costBasis: "reported", status: "waiting" });

    const kinds = (await h.get("/api/activity?limit=100")).body.entries.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["run.started", "run.progress", "work_product.recorded", "run.finished"]));

    const [first, second] = ticket.workProducts.map((p: { id: string }) => p.id);
    expect((await h.post(`${P}/work-products/approve`, { workProductId: first })).body).toMatchObject({ changed: true, closed: false });
    const approved = await h.post(`${P}/work-products/approve`, { workProductId: second });
    expect(approved.body).toMatchObject({ changed: true, closed: true, ticket: { status: "done" } });
  });

  it("a declined card launches nothing and blocks the ticket with the reason", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-success.jsonl") });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "Write notes", { requireReview: false });
    await answerApproval(h, (await nextApproval(h)).id, "deny");
    await settleRuns();
    expect(kit.launches).toHaveLength(0);
    const ticket = (await h.get("/api/tickets/T-1")).body;
    expect(ticket.status).toBe("blocked");
    expect(ticket.runs[0]).toMatchObject({ status: "failed" });
    expect(ticket.runs[0].error).toContain("declined");
  });

  it("an Always answer is saved for this project only and skips the card next time", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-success.jsonl") });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "First", { requireReview: false });
    await answerApproval(h, (await nextApproval(h)).id, "always");
    await settleRuns();
    const rules = await loadRules(process.env);
    expect(rules).toEqual([expect.objectContaining({ action: "allow", tool: "call_agent", root: expect.stringContaining("vanta-company-root-") })]);
    await ticketFor("T-2", "Second", { requireReview: false });
    await settleRuns();
    expect((await h.get("/api/approval")).body).toBeNull();
    expect(kit.launches).toHaveLength(2);
    expect((await h.get("/api/tickets/T-2")).body.status).toBe("done");
  });

  it("pausing the worker while the card is open withdraws the card and aborts the run", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-success.jsonl") });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "Long job", { requireReview: false });
    await nextApproval(h);
    await h.post(`${P}/workers/pause`, { workerId: "engineer" });
    await settleRuns();
    expect((await h.get("/api/approval")).body).toBeNull();
    expect(kit.launches).toHaveLength(0);
    const ticket = (await h.get("/api/tickets/T-1")).body;
    expect(ticket.runs[0].status).toBe("failed");
    expect(ticket.runs[0].error).toContain("aborted");
  });

  it("pausing mid-run stops the process and blocks the ticket", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-budget.jsonl").slice(0, 1), hold: true });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "Long job", { requireReview: false });
    await answerApproval(h, (await nextApproval(h)).id, "allow");
    for (let i = 0; i < 300 && kit.launches.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await h.post(`${P}/workers/pause`, { workerId: "engineer" });
    await settleRuns();
    const ticket = (await h.get("/api/tickets/T-1")).body;
    expect(ticket.runs[0]).toMatchObject({ status: "failed" });
    expect(ticket.runs[0].error).toContain("aborted");
    expect(ticket.status).toBe("blocked");
  });

  it("a budget stop: the CLI is capped to what is left, the overspend is recorded, and the next ticket stays queued", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-budget.jsonl"), code: 1 });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code", budgetUsd: 0.5 });
    await ticketFor("T-1", "Expensive", { requireReview: false });
    await answerApproval(h, (await nextApproval(h)).id, "allow");
    await settleRuns();
    expect(kit.launches[0]!.args).toEqual(expect.arrayContaining(["--max-budget-usd", "0.5"]));
    const first = (await h.get("/api/tickets/T-1")).body;
    expect(first.runs[0]).toMatchObject({ status: "failed", costUsd: 0.5012, costBasis: "reported" });
    expect((await h.get("/api/budgets")).body.limits[0]).toMatchObject({ scope: "agent:engineer", status: "exceeded" });
    await h.post(`${P}/tickets/create`, { title: "Next" });
    const second = await h.post(`${P}/tickets/assign`, { ticketId: "T-2", workerId: "engineer" });
    expect(second.body.run).toMatchObject({ started: false });
    expect(second.body.run.reason).toContain("budget exceeded");
    expect(kit.launches).toHaveLength(1);
  });

  it("a kernel block refuses the launch without a card", async () => {
    const kit = externalKit({ stdout: lines("claude-stream-success.jsonl") }, { verdict: "block" });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "Write notes", { requireReview: false });
    await settleRuns();
    expect((await h.get("/api/approval")).body).toBeNull();
    expect(kit.launches).toHaveLength(0);
    expect((await h.get("/api/tickets/T-1")).body.runs[0].error).toContain("blocked");
  });
});

describe("availability", () => {
  it("lists every runtime with its detect result and the adapter to hire it with", async () => {
    useKit(externalKit({ stdout: [] }));
    const reply = await h.get(`${P}/runtimes`);
    expect(reply.status).toBe(200);
    const byId = Object.fromEntries(reply.body.runtimes.map((r: { runtimeId: string }) => [r.runtimeId, r]));
    expect(byId["vanta-native"]).toMatchObject({ installed: true, auth: "not-applicable", adapter: null, displayName: "Vanta" });
    expect(byId["claude-code"]).toMatchObject({ installed: true, version: "2.1.222", auth: "authenticated", adapter: "cli:claude-code", selfApproving: false, displayName: "Claude Code" });
    expect(byId.codex).toMatchObject({ installed: true, adapter: "cli:codex" });
    expect(byId.hermes).toMatchObject({ adapter: "cli:hermes", selfApproving: true });
  });

  it("a CLI that is not signed in fails before any card is shown", async () => {
    const kit = externalKit({ stdout: [] }, { auth: "signed-out" });
    useKit(kit);
    await hireDev(h, { adapter: "cli:claude-code" });
    await ticketFor("T-1", "Write notes", { requireReview: false });
    await settleRuns();
    expect((await h.get("/api/approval")).body).toBeNull();
    expect(kit.launches).toHaveLength(0);
    expect((await h.get("/api/tickets/T-1")).body.runs[0].error).toContain("not signed in");
  });

  it("an unknown runtime id names what is registered", async () => {
    const kit = externalKit({ stdout: [] });
    useKit(kit);
    await hireDev(h, { adapter: "cli:nonexistent" });
    await ticketFor("T-1", "Write notes", { requireReview: false });
    await settleRuns();
    const error = (await h.get("/api/tickets/T-1")).body.runs[0].error as string;
    expect(error).toContain('no worker runtime "nonexistent"');
    expect(error).toContain("claude-code");
  });
});

describe("cost honesty for a CLI that reports no dollars", () => {
  it("a Codex worker records tokens with cost not-reported, and nothing is added to USD totals", async () => {
    const kit = externalKit({ stdout: lines("codex-events.jsonl") });
    useKit(kit);
    await hireDev(h, { adapter: "cli:codex", budgetUsd: 5 });
    await ticketFor("T-1", "Update the index", { requireReview: false });
    await answerApproval(h, (await nextApproval(h)).id, "allow");
    await settleRuns();
    expect(kit.launches[0]!.cmd).toBe("codex");
    const ticket = (await h.get("/api/tickets/T-1")).body;
    expect(ticket.runs[0]).toMatchObject({ runtime: "codex", status: "done", costUsd: null, costBasis: "not-reported", usage: { inputTokens: 24763, outputTokens: 122 } });
    const budgets = (await h.get("/api/budgets")).body;
    expect(budgets.workers[0]).toMatchObject({ scope: "agent:engineer", estimatedUsd: 0, reportedUsd: 0 });
    expect(budgets.workers[0].runs.notReported).toBe(1);
    expect(budgets.limits[0]).toMatchObject({ status: "active" });
    expect((await h.get("/api/company")).body.workers[0]).toMatchObject({ costUsd: 0, costBasis: "not-reported" });
  });
});

describe("hire validation", () => {
  it("rejects a malformed cli adapter", async () => {
    const reply = await h.post(`${P}/workers/hire`, { role: "Engineer", adapter: "cli:Bad Id" });
    expect(reply.status).toBe(400);
    expect(reply.body.error).toContain("invalid worker runtime");
  });
});
