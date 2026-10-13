import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBudget } from "../budget/store.js";
import { readTasks } from "../team/tasks.js";
import { readTeam } from "../team/store.js";
import { resetCompanyPorts, setCompanyPorts } from "./company-ports.js";
import { settleRuns } from "./company-run-state.js";
import { startCompanyHarness, type CompanyHarness } from "./__fixtures__/company-harness.js";
import { hireDev, postWithApproval, stubRuntime } from "./__fixtures__/company-helpers.js";
import { headers } from "./__fixtures__/sse-harness.js";

let h: CompanyHarness;
const P = "/api/company";
beforeEach(async () => {
  h = await startCompanyHarness();
  setCompanyPorts({ runtime: () => stubRuntime() });
});
afterEach(async () => { await settleRuns(); resetCompanyPorts(); await h.close(); });

describe("company write routes: bodies and boundary", () => {
  it.each([
    ["/workers/hire", {}, "role is required"],
    ["/workers/hire", { role: "X", adapter: "openai", surprise: 1 }, "Unrecognized key"],
    ["/tickets/create", { title: "" }, "title must not be empty"],
    ["/tickets/assign", { ticketId: "T-1" }, "workerId is required"],
    ["/budgets/raise", { scope: "agent:x", limitUsd: -1 }, "limitUsd must be greater than 0"],
    ["/work-products/revise", { workProductId: "wp" }, "reason is required"],
  ])("%s with a bad body answers 400 naming the problem", async (path, body, text) => {
    const reply = await h.post(P + path, body);
    expect(reply.status).toBe(400);
    expect(reply.body.error).toContain(text);
  });

  it("answers 400 for malformed JSON and 404 for an unknown company route", async () => {
    const bad = await fetch(`http://127.0.0.1:${h.server.port}${P}/tickets/create`, { method: "POST", headers: headers("x"), body: "{nope" });
    expect(bad.status).toBe(400);
    const unknown = await h.post(`${P}/nothing`, {});
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toContain("/api/company/workers/hire");
  });

  it("requires the boundary token and rejects other methods", async () => {
    const noToken = await fetch(`http://127.0.0.1:${h.server.port}${P}/tick`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(noToken.status).toBe(403);
    const put = await fetch(`http://127.0.0.1:${h.server.port}${P}/tick`, { method: "PUT", headers: headers("x"), body: "{}" });
    expect(put.status).toBe(405);
  });
});

describe("hire, pause, resume", () => {
  it("hire waits for approval and a decline creates nothing", async () => {
    const declined = await postWithApproval(h, `${P}/workers/hire`, { role: "Engineer", adapter: "openai" }, false);
    expect(declined.status).toBe(403);
    expect(await readTeam()).toEqual([]);
  });

  it("hire rejects an unknown adapter before asking for approval", async () => {
    const reply = await h.post(`${P}/workers/hire`, { role: "Engineer", adapter: "nope" });
    expect(reply.status).toBe(400);
    expect(reply.body.error).toContain("GET /api/models");
  });

  it("hire is idempotent by requestId and wires manager, budget scope and reporting line", async () => {
    await hireDev(h, { title: "Boss" });
    const body = { role: "Designer", adapter: "openai", budgetUsd: 3, managerId: "engineer", requestId: "r-1" };
    const first = await postWithApproval(h, `${P}/workers/hire`, body);
    expect(first.body).toMatchObject({ changed: true, worker: { id: "designer", reportsTo: "engineer", budgetUsd: 3 } });
    const again = await h.post(`${P}/workers/hire`, body);
    expect(again.body).toMatchObject({ changed: false, worker: { id: "designer" } });
    expect((await getBudget(`${h.root}/.vanta`, "agent:designer"))?.limitUsd).toBe(3);
    expect(await h.post(`${P}/workers/hire`, { ...body, requestId: "r-2", managerId: "ghost" })).toMatchObject({ status: 400 });
  });

  it("pause and resume are idempotent and 404 for an unknown worker", async () => {
    await hireDev(h);
    const paused = await h.post(`${P}/workers/pause`, { workerId: "engineer", reason: "lunch" });
    expect(paused.body).toMatchObject({ changed: true, worker: { status: "paused", paused: true } });
    expect((await h.post(`${P}/workers/pause`, { workerId: "engineer" })).body.changed).toBe(false);
    expect((await h.post(`${P}/workers/resume`, { workerId: "engineer" })).body).toMatchObject({ changed: true, worker: { status: "idle", paused: false } });
    expect((await h.post(`${P}/workers/resume`, { workerId: "engineer" })).body.changed).toBe(false);
    expect((await h.post(`${P}/workers/pause`, { workerId: "ghost" })).status).toBe(404);
  });
});

describe("tickets", () => {
  it("creates, deduplicates by requestId, and validates the parent", async () => {
    const made = await h.post(`${P}/tickets/create`, { title: "Plan launch", description: "Keep it short", requestId: "q1", goalId: "2" });
    expect(made.body).toMatchObject({ changed: true, ticket: { id: "T-1", status: "open", goalId: "2", commentCount: 1 } });
    expect((await h.post(`${P}/tickets/create`, { title: "Plan launch", requestId: "q1" })).body).toMatchObject({ changed: false, ticket: { id: "T-1" } });
    expect((await h.post(`${P}/tickets/create`, { title: "Sub", parentId: "T-9" })).status).toBe(400);
    expect((await h.post(`${P}/tickets/create`, { title: "Sub", parentId: "T-1" })).body.ticket.id).toBe("T-2");
  });

  it("comments with an author and is idempotent by requestId", async () => {
    await h.post(`${P}/tickets/create`, { title: "A" });
    await h.post(`${P}/tickets/comment`, { ticketId: "T-1", text: "first", requestId: "c1" });
    expect((await h.post(`${P}/tickets/comment`, { ticketId: "T-1", text: "first", requestId: "c1" })).body.changed).toBe(false);
    const detail = await h.get("/api/tickets/T-1");
    expect(detail.body.thread).toEqual([expect.objectContaining({ author: "owner", text: "first" })]);
    expect((await h.post(`${P}/tickets/comment`, { ticketId: "nope", text: "x" })).status).toBe(404);
  });

  it("assign creates a task with the owner-review stage and queues when the worker is paused", async () => {
    await hireDev(h);
    await h.post(`${P}/workers/pause`, { workerId: "engineer" });
    await h.post(`${P}/tickets/create`, { title: "A", expectedOutput: "report" });
    const reply = await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    expect(reply.body).toMatchObject({ changed: true, ticket: { status: "assigned", workerId: "engineer", pendingReviews: 1 }, run: { started: false } });
    expect(reply.body.run.reason).toContain("paused");
    const [task] = await readTasks();
    expect(task).toMatchObject({ id: "T-1", outcome: { expectedOutput: "report" }, reviewStages: [{ name: "owner-review", reviewerId: "owner" }] });
    expect((await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" })).body.changed).toBe(false);
    expect((await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "ghost" })).status).toBe(404);
  });

  it("close refuses while review is open, and wontfix removes the task", async () => {
    await hireDev(h);
    await h.post(`${P}/tickets/create`, { title: "A" });
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer", start: false });
    const refused = await h.post(`${P}/tickets/close`, { ticketId: "T-1" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain("review stage");
    const closed = await h.post(`${P}/tickets/close`, { ticketId: "T-1", resolution: "wontfix" });
    expect(closed.body.ticket.status).toBe("closed");
    expect((await h.post(`${P}/tickets/close`, { ticketId: "T-1", resolution: "wontfix" })).body.ticket.status).toBe("closed");
  });

  it("answer needs a blocked ticket, then comments and restarts the worker", async () => {
    await hireDev(h);
    setCompanyPorts({ runtime: () => stubRuntime({ result: { ok: false, error: "need the brand colour" } }) });
    await h.post(`${P}/tickets/create`, { title: "A", requireReview: false });
    expect((await h.post(`${P}/tickets/answer`, { ticketId: "T-1", answer: "blue" })).status).toBe(404);
    await h.post(`${P}/tickets/assign`, { ticketId: "T-1", workerId: "engineer" });
    await settleRuns();
    expect((await h.get("/api/tickets/T-1")).body).toMatchObject({ status: "blocked", blocker: "run failed: need the brand colour" });
    expect((await h.get("/api/company")).body.workers[0].status).toBe("failed");
    setCompanyPorts({ runtime: () => stubRuntime() });
    const answered = await h.post(`${P}/tickets/answer`, { ticketId: "T-1", answer: "blue" });
    expect(answered.body.run.started).toBe(true);
    await settleRuns();
    const detail = (await h.get("/api/tickets/T-1")).body;
    expect(detail.status).toBe("done");
    expect(detail.thread).toEqual([expect.objectContaining({ kind: "answer", text: "blue" })]);
    expect((await h.post(`${P}/tickets/answer`, { ticketId: "T-1", answer: "x" })).status).toBe(409);
  });
});

describe("budget raise and tick", () => {
  it("raise needs approval, never lowers, and journals the change", async () => {
    await hireDev(h, { budgetUsd: 2 });
    expect((await h.post(`${P}/budgets/raise`, { scope: "agent:engineer", limitUsd: 1 })).body).toMatchObject({ changed: false, previousLimitUsd: 2 });
    expect((await postWithApproval(h, `${P}/budgets/raise`, { scope: "agent:engineer", limitUsd: 5 }, false)).status).toBe(403);
    const raised = await postWithApproval(h, `${P}/budgets/raise`, { scope: "agent:engineer", limitUsd: 5 });
    expect(raised.body).toMatchObject({ changed: true, previousLimitUsd: 2, budget: { limitUsd: 5, kind: "worker" } });
    expect((await h.get("/api/company")).body.workers[0].budgetUsd).toBe(5);
    const feed = (await h.get("/api/activity?kind=budget.raised")).body.entries;
    expect(feed[0].summary).toContain("from 2 to 5");
    expect((await h.post(`${P}/budgets/raise`, { scope: "agent:ghost", limitUsd: 5 })).status).toBe(404);
  });

  it("tick with no departments is a clean no-op with a warning", async () => {
    const reply = await h.post(`${P}/tick`, {});
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ dispatched: 0, beats: [] });
    expect(reply.body.warnings[0]).toContain("No departments");
  });
});
