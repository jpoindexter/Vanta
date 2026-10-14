import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addDepartment, writeDepartments } from "../cofounder/department.js";
import { readObjectives } from "../cofounder/okr-store.js";
import { startCompanyHarness, type CompanyHarness } from "./__fixtures__/company-harness.js";
import { openSse, type SseProbe } from "./__fixtures__/sse-harness.js";

let h: CompanyHarness;
const probes: SseProbe[] = [];
const P = "/api/company/okrs";
beforeEach(async () => { h = await startCompanyHarness(); });
afterEach(async () => {
  probes.splice(0).forEach((p) => p.close());
  await h.close();
});

const KR = { name: "signups", target: 100, current: 25 };

describe("POST /api/company/okrs/create", () => {
  it("creates an objective that GET /api/okrs then reports with its progress", async () => {
    const made = await h.post(`${P}/create`, { title: "Grow revenue", keyResults: [KR] });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ changed: true, objective: { id: "grow-revenue", title: "Grow revenue", progress: 0.25, departmentId: null } });
    const read = await h.get("/api/okrs");
    expect(read.body.objectives).toHaveLength(1);
    expect(read.body.furthest).toMatchObject({ objectiveId: "grow-revenue", keyResult: "signups", gap: 0.75 });
    expect(await readObjectives()).toHaveLength(1);
  });

  it("allows an objective with no key results yet and gives a repeated title its own id", async () => {
    const first = await h.post(`${P}/create`, { title: "Ship v1" });
    const second = await h.post(`${P}/create`, { title: "Ship v1" });
    expect(first.body.objective).toMatchObject({ id: "ship-v1", progress: 0, keyResults: [] });
    expect(second.body.objective.id).toBe("ship-v1-2");
  });

  it("accepts a department that exists and refuses one that does not", async () => {
    const dept = addDepartment([], { name: "Product", workerIds: ["engineer"], goalIds: [1] });
    if (!dept.ok) throw new Error(dept.error);
    await writeDepartments([dept.value]);
    expect((await h.post(`${P}/create`, { title: "A", departmentId: "product" })).body.objective.departmentId).toBe("product");
    const bad = await h.post(`${P}/create`, { title: "B", departmentId: "ghost" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('departmentId "ghost" is not a department');
  });

  it.each([
    [{}, "title is required"],
    [{ title: "  " }, "title must not be empty"],
    [{ title: "X", surprise: 1 }, "Unrecognized key"],
    [{ title: "X", keyResults: [{ name: "a", target: 0 }] }, "target must be greater than 0"],
    [{ title: "X", keyResults: [{ target: 5 }] }, "key result name is required"],
    [{ title: "X", keyResults: [{ name: "a", target: 5, current: "lots" }] }, "current must be a number"],
  ])("a bad body %j answers 400 naming the problem", async (body, text) => {
    const reply = await h.post(`${P}/create`, body);
    expect(reply.status).toBe(400);
    expect(reply.body.error).toContain(text);
    expect(await readObjectives()).toEqual([]);
  });
});

describe("POST /api/company/okrs/progress", () => {
  beforeEach(async () => { await h.post(`${P}/create`, { title: "Grow revenue", keyResults: [KR] }); });

  it("sets a key result's current value and the objective's progress follows", async () => {
    const reply = await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "signups", current: 80 });
    expect(reply.status).toBe(200);
    expect(reply.body.objective).toMatchObject({ progress: 0.8, keyResults: [{ name: "signups", current: 80, target: 100, progress: 0.8 }] });
  });

  it("adds a new key result only when a target comes with it", async () => {
    const added = await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "mrr", current: 10, target: 40 });
    expect(added.body.objective.keyResults.map((k: { name: string }) => k.name)).toEqual(["signups", "mrr"]);
    const missing = await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "churn", current: 1 });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain("needs a target");
  });

  it("answers 404 for an unknown objective, 400 for a bad number", async () => {
    const unknown = await h.post(`${P}/progress`, { objectiveId: "ghost", name: "x", current: 1 });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toContain("GET /api/okrs");
    expect((await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "signups", current: "many" })).status).toBe(400);
    expect((await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "signups" })).body.error).toContain("current is required");
  });
});

describe("OKR writes leave a trail", () => {
  it("journals both writes in the company activity log and pushes activity.appended", async () => {
    const probe = await openSse(h.server.port, "watcher");
    probes.push(probe);
    await h.post(`${P}/create`, { title: "Grow revenue", keyResults: [KR] });
    await h.post(`${P}/progress`, { objectiveId: "grow-revenue", name: "signups", current: 60 });
    const pushed = await probe.waitFor((f) => f.typed?.type === "activity.appended" && (f.typed as unknown as { entry: { kind: string } }).entry.kind === "okr.progress");
    expect(pushed).toBeTruthy();
    const log = (await readFile(join(h.home, "company-activity.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { kind: string; actor: string });
    expect(log.map((e) => e.kind)).toEqual(["okr.created", "okr.progress"]);
    expect(log.every((e) => e.actor === "owner")).toBe(true);
  });

  it("requires the desktop boundary token", async () => {
    const response = await fetch(`http://127.0.0.1:${h.server.port}${P}/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) });
    expect(response.status).toBe(403);
  });
});
