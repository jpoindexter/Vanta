import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDepartment, writeDepartments } from "../cofounder/department.js";
import { resetCompanyPorts, setCompanyPorts } from "./company-ports.js";
import { settleRuns } from "./company-run-state.js";
import { COMPANY_SID, startCompanyHarness, type CompanyHarness } from "./__fixtures__/company-harness.js";
import { hireDev, postWithApproval, stubRuntime } from "./__fixtures__/company-helpers.js";
import { openSse, typedOf, type SseProbe } from "./__fixtures__/sse-harness.js";

let h: CompanyHarness;
const probes: SseProbe[] = [];
const P = "/api/company";
beforeEach(async () => {
  h = await startCompanyHarness();
  setCompanyPorts({ runtime: () => stubRuntime() });
});
afterEach(async () => {
  probes.splice(0).forEach((p) => p.close());
  await settleRuns();
  resetCompanyPorts();
  await h.close();
});

async function listen(sid: string): Promise<SseProbe> {
  const probe = await openSse(h.server.port, sid);
  probes.push(probe);
  return probe;
}

describe("end to end: hire, ticket, work, approve, close", () => {
  it("runs the whole chain over real stores and broadcasts company events to every client", async () => {
    const requester = await listen(COMPANY_SID);
    const otherWindow = await listen("second-window");

    await hireDev(h, { budgetUsd: 5 });
    await requester.waitFor((f) => f.typed?.type === "approval.request");

    const created = await h.post(`${P}/tickets/create`, { title: "Write the launch plan", expectedOutput: "report" });
    expect(created.body.ticket).toMatchObject({ id: "T-1", status: "open" });
    const assigned = await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    expect(assigned.body.run.started).toBe(true);
    await settleRuns();

    const review = (await h.get("/api/tickets/T-1")).body;
    expect(review).toMatchObject({ status: "in_review", workProductCount: 1, pendingReviews: 1 });
    expect(review.runs[0]).toMatchObject({ status: "awaiting_review", runtime: "stub", costUsd: 0.1, costBasis: "estimated", model: "gpt-stub" });
    expect(review.workProducts[0]).toMatchObject({ approved: false, kind: "report", provenance: { taskId: "T-1", workerId: "engineer", departmentId: "team" } });
    expect((await h.get("/api/company")).body.workers[0]).toMatchObject({ status: "waiting", currentTicketId: "T-1", costUsd: 0.1 });
    expect((await h.get("/api/budgets")).body.workers[0]).toMatchObject({ estimatedUsd: 0.1, scope: "agent:engineer" });

    const approved = await h.post(`${P}/work-products/approve`, { workProductId: review.workProducts[0].id });
    expect(approved.body).toMatchObject({ changed: true, closed: true, ticket: { status: "done" }, workProduct: { approved: true } });
    expect((await h.get("/api/company")).body.workers[0].status).toBe("idle");
    expect((await h.post(`${P}/work-products/approve`, { workProductId: review.workProducts[0].id })).body.changed).toBe(false);

    const kinds = (await h.get("/api/activity?limit=100")).body.entries.map((e: { kind: string }) => e.kind).reverse();
    const chain = ["worker.hired", "ticket.created", "ticket.assigned", "run.started", "work_product.recorded", "run.finished", "work_product.approved", "ticket.closed"];
    expect(kinds.filter((k: string) => chain.includes(k))).toEqual(chain);

    for (const probe of [requester, otherWindow]) {
      await probe.waitFor((f) => f.typed?.type === "ticket.updated" && (f.typed as any).ticket.status === "done");
      const types = new Set(typedOf(probe.frames).map((t) => t.type));
      expect([...types]).toEqual(expect.arrayContaining(["ticket.updated", "worker.status", "activity.appended"]));
    }
    expect(typedOf(otherWindow.frames).some((t) => t.type === "approval.request")).toBe(false);
  });

  it("pages the activity feed with a cursor and rejects a foreign cursor", async () => {
    await hireDev(h);
    await h.post(`${P}/tickets/create`, { title: "A" });
    await h.post(`${P}/tickets/create`, { title: "B" });
    const first = (await h.get("/api/activity?limit=2")).body;
    expect(first.entries).toHaveLength(2);
    const second = (await h.get(`/api/activity?limit=2&cursor=${first.nextCursor}`)).body;
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.entries[0].id).not.toBe(first.entries[1].id);
    expect((await h.get("/api/activity?cursor=garbage")).status).toBe(400);
  });
});

describe("revision, pause, budget alert and tick", () => {
  it("revision re-runs the producing task and updates the same work product", async () => {
    await hireDev(h);
    await h.post(`${P}/tickets/create`, { title: "Draft" });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    await settleRuns();
    const id = (await h.get("/api/work-products")).body.workProducts[0].id;
    const revised = await h.post(`${P}/work-products/revise`, { workProductId: id, reason: "shorter please" });
    expect(revised.body.error ?? "").toBe("");
    expect(revised.body.run.started).toBe(true);
    await settleRuns();
    const detail = (await h.get("/api/tickets/T-1")).body;
    expect(detail.workProducts).toHaveLength(1);
    expect(detail.workProducts[0]).toMatchObject({ id, approved: false, revisions: [{ reason: "shorter please" }] });
    expect(detail.runs.map((r: { attempt: number }) => r.attempt)).toEqual([1, 2]);
    expect(detail.status).toBe("in_review");
    expect((await h.post(`${P}/work-products/approve`, { workProductId: id })).body.closed).toBe(true);
    expect((await h.post(`${P}/work-products/revise`, { workProductId: id, reason: "again" })).status).toBe(409);
  });

  it("pause aborts the in-flight run through its AbortController", async () => {
    setCompanyPorts({ runtime: () => stubRuntime({ gate: (r) => new Promise<void>((resolve) => r.signal.addEventListener("abort", () => resolve())) }) });
    await hireDev(h);
    await h.post(`${P}/tickets/create`, { title: "Long job", requireReview: false });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    expect((await h.get("/api/company")).body.workers[0].status).toBe("working");
    await h.post(`${P}/workers/pause`, { workerId: "engineer" });
    await settleRuns();
    const detail = (await h.get("/api/tickets/T-1")).body;
    expect(detail.runs[0]).toMatchObject({ status: "failed" });
    expect(detail.runs[0].error).toContain("aborted");
    expect(detail.status).toBe("blocked");
    expect((await h.get("/api/company")).body.workers[0].status).toBe("paused");
  });

  it("emits budget.alert when a run pushes a worker past its warning threshold", async () => {
    const probe = await listen("watcher");
    await hireDev(h, { budgetUsd: 0.12 });
    await h.post(`${P}/tickets/create`, { title: "Cheap job", requireReview: false });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    await settleRuns();
    const alert = await probe.waitFor((f) => f.typed?.type === "budget.alert");
    expect(alert.typed).toMatchObject({ scope: "agent:engineer", level: "warning", limitUsd: 0.12 });
    expect((await h.get("/api/budgets")).body.limits[0]).toMatchObject({ status: "warning", hardStop: { tripped: false } });
  });

  it("a budget hard stop keeps the next ticket queued until the owner raises it", async () => {
    await hireDev(h, { budgetUsd: 0.1 });
    for (const title of ["one", "two"]) await h.post(`${P}/tickets/create`, { title, requireReview: false });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    await settleRuns();
    const second = await h.post(`${P}/tickets/assign`, { ticketId: "T-2", workerId: "engineer" });
    expect(second.body.run).toMatchObject({ started: false });
    expect(second.body.run.reason).toContain("budget exceeded");
    await postWithApproval(h, `${P}/budgets/raise`, { scope: "agent:engineer", limitUsd: 1 });
    await settleRuns();
    expect((await h.get("/api/tickets/T-2")).body.status).toBe("done");
  });

  it("tick starts the queued ticket of a department that has goals and budget", async () => {
    await hireDev(h);
    const dept = addDepartment([], { name: "Product", workerIds: ["engineer"], goalIds: [1] });
    if (!dept.ok) throw new Error(dept.error);
    await writeDepartments([dept.value]);
    setCompanyPorts({ runtime: () => stubRuntime(), readGoals: async () => [{ id: 1, text: "ship", status: "active" }] });
    await h.post(`${P}/tickets/create`, { title: "Queued", requireReview: false });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer", start: false });
    const tick = await h.post(`${P}/tick`, {});
    expect(tick.body).toMatchObject({ dispatched: 1, beats: [{ departmentId: "product", reason: "dispatched", taskId: "T-1" }], warnings: [] });
    await settleRuns();
    expect((await h.get("/api/tickets/T-1")).body.status).toBe("done");
  });
});
