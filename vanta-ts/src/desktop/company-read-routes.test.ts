import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setBudgetLimit } from "../budget/store.js";
import { writeObjectives } from "../cofounder/okr-store.js";
import { writeWorkProducts } from "../cofounder/work-products.js";
import { appendSpend } from "../cost/ledger.js";
import { appendTeam } from "../team/store.js";
import { appendTask } from "../team/tasks.js";
import { addComment, createTicket } from "../tickets/store.js";
import { encodeComment } from "./company-comments.js";
import { appendRun } from "./company-runs.js";
import { startCompanyHarness, type CompanyHarness } from "./__fixtures__/company-harness.js";
import { headers } from "./__fixtures__/sse-harness.js";

let h: CompanyHarness;
beforeEach(async () => { h = await startCompanyHarness(); });
afterEach(async () => { await h.close(); });

const READ_ROUTES = ["/api/company", "/api/tickets", "/api/budgets", "/api/activity", "/api/okrs", "/api/work-products", "/api/heartbeats"];

describe("company read routes with absent stores", () => {
  it.each(READ_ROUTES)("%s answers 200 with a valid empty payload", async (path) => {
    const reply = await h.get(path);
    expect(reply.status).toBe(200);
    expect(reply.body).toBeTypeOf("object");
  });

  it("returns an empty org chart and zero totals", async () => {
    const { body } = await h.get("/api/company");
    expect(body.workers).toEqual([]);
    expect(body.orgChart).toEqual([]);
    expect(body.totals).toMatchObject({ workers: 0, working: 0, openTickets: 0, costUsd: 0 });
  });

  it("answers 404 with a pointer for an unknown ticket id", async () => {
    const reply = await h.get("/api/tickets/nope");
    expect(reply.status).toBe(404);
    expect(reply.body.error).toContain("GET /api/tickets");
  });
});

describe("company read routes over seeded stores", () => {
  const at = "2026-10-13T10:00:00.000Z";
  const deps = { now: () => new Date(at), id: () => "T-1" };

  beforeEach(async () => {
    await appendTeam({ kind: "worker", id: "boss", role: "Head of Product", status: "idle", ts: at, title: "Boss", adapter: "openai", budgetUsd: 5 });
    await appendTeam({ kind: "worker", id: "dev", role: "Engineer", status: "idle", ts: at, managerId: "boss" });
    const dataDir = join(h.root, ".vanta");
    await createTicket(dataDir, { title: "Ship onboarding", links: { goalId: "3", projectId: "web" } }, deps);
    await addComment(dataDir, "T-1", encodeComment({ author: "owner", text: "Start with the empty state" }), deps);
    await appendTask({ kind: "task", id: "T-1", workerId: "dev", title: "Ship onboarding", status: "blocked", blocker: "needs copy", created: at, updated: at });
    await appendTask({ kind: "task", id: "cli-task", workerId: "dev", title: "Made on the CLI", status: "assigned", created: at, updated: at });
    await writeWorkProducts([{ id: "team-wp-1", artifact: "draft token=sk-abcdefghijklmnopqrstuvwxyz0123", kind: "document", sourceTaskId: "T-1", departmentId: "team", producedBy: "dev", approved: false, createdAt: at }]);
    await setBudgetLimit(dataDir, { scope: "agent:dev", limitUsd: 2 });
    await appendSpend(dataDir, { agent: "worker:dev", provider: "openai", model: "gpt-x", costUsd: 0.25, inputTokens: 10, outputTokens: 5 }, new Date(at));
    await appendRun(h.home, { runId: "r1", ticketId: "T-1", workerId: "dev", runtime: "vanta-native", status: "failed", attempt: 1, startedAt: at, finishedAt: at, summary: null, error: "boom", usage: null, costUsd: 0.25, costBasis: "estimated", provider: "openai", model: "gpt-x" });
    await writeObjectives([{ id: "grow", title: "Grow", keyResults: [{ name: "signups", current: 5, target: 10 }], createdAt: at, updatedAt: at }]);
  });

  it("builds the org chart, status and cost per worker", async () => {
    const { body } = await h.get("/api/company");
    const dev = body.workers.find((w: { id: string }) => w.id === "dev");
    expect(dev).toMatchObject({ reportsTo: "boss", status: "failed", currentTicketId: "T-1", costUsd: 0.25, costBasis: "estimated" });
    expect(body.workers.find((w: { id: string }) => w.id === "boss")).toMatchObject({ directReports: ["dev"], budgetUsd: 5, status: "idle" });
    expect(body.orgChart).toEqual([{ workerId: "boss", reports: [{ workerId: "dev", reports: [] }] }]);
    expect(body.pending.workProducts).toBe(1);
  });

  it("joins tickets and team tasks and filters them", async () => {
    const all = await h.get("/api/tickets");
    expect(all.body.tickets.map((t: { id: string; source: string }) => [t.id, t.source]).sort()).toEqual([["T-1", "both"], ["cli-task", "team-task"]]);
    expect((await h.get("/api/tickets?status=blocked")).body.tickets).toHaveLength(1);
    expect((await h.get("/api/tickets?worker=dev&project=web")).body.tickets.map((t: { id: string }) => t.id)).toEqual(["T-1"]);
    expect((await h.get("/api/tickets?status=bogus")).status).toBe(400);
  });

  it("returns the ticket thread, blockers, runs, products and ancestry", async () => {
    const { status, body } = await h.get("/api/tickets/T-1");
    expect(status).toBe(200);
    expect(body.thread[0]).toMatchObject({ author: "owner", text: "Start with the empty state" });
    expect(body.blockers).toEqual([{ kind: "blocker", text: "needs copy" }]);
    expect(body.runs[0]).toMatchObject({ runId: "r1", status: "failed", costBasis: "estimated" });
    expect(body.workProducts[0].provenance).toEqual({ taskId: "T-1", workerId: "dev", departmentId: "team" });
    expect(body.ancestry).toEqual([
      { kind: "goal", id: "3", title: null, status: null, resolved: false },
      { kind: "project", id: "web", title: null, status: null, resolved: false },
    ]);
  });

  it("never returns secrets in work product bodies", async () => {
    const { body } = await h.get("/api/work-products");
    expect(JSON.stringify(body)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz0123");
  });

  it("reports budgets with thresholds, day series and cost bases", async () => {
    const { body } = await h.get("/api/budgets");
    expect(body.limits[0]).toMatchObject({ scope: "agent:dev", kind: "worker", subject: "dev", limitUsd: 2, status: "active" });
    expect(body.limits[0].thresholds).toEqual({ warnAtUsd: 1.6, hardStopAtUsd: 2 });
    expect(body.workers.find((w: { workerId: string }) => w.workerId === "dev")).toMatchObject({ estimatedUsd: 0.25, scope: "agent:dev", runs: { estimated: 1, reported: 0, notReported: 0 } });
    expect(body.days[0]).toMatchObject({ day: "2026-10-13", totalUsd: 0.25, workerUsd: 0.25 });
  });

  it("reports OKR progress and the key result furthest from target", async () => {
    const { body } = await h.get("/api/okrs");
    expect(body.objectives[0]).toMatchObject({ id: "grow", progress: 0.5 });
    expect(body.furthest).toEqual({ objectiveId: "grow", keyResult: "signups", gap: 0.5 });
  });

  it("derives worker heartbeats and lists the pipeline log", async () => {
    await mkdir(join(h.root, ".vanta"), { recursive: true });
    await writeFile(join(h.root, ".vanta", "heartbeat-runs.json"), JSON.stringify([{ id: "hb1", status: "done", pid: 1, startedAt: "2026-10-13T09:00:00.000Z" }]));
    const { body } = await h.get("/api/heartbeats");
    expect(body.runs).toEqual([{ id: "hb1", status: "done", startedAt: "2026-10-13T09:00:00.000Z", finishedAt: null, stage: null, error: null }]);
    expect(body.workers.find((w: { workerId: string }) => w.workerId === "dev")).toMatchObject({ source: "run", currentTicketId: "T-1" });
  });
});

describe("company route boundary", () => {
  it("requires the desktop boundary token", async () => {
    const response = await fetch(`http://127.0.0.1:${h.server.port}/api/company`, { headers: { "x-session-id": "x" } });
    expect(response.status).toBe(403);
  });

  it("answers 405 for methods other than GET and POST", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const response = await fetch(`http://127.0.0.1:${h.server.port}/api/company`, { method, headers: headers("x") });
      expect(response.status).toBe(405);
    }
  });
});
