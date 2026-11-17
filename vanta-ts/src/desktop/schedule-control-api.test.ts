import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataDirFor } from "../cli/ops.js";
import { loadCron, scriptAuthorityValid } from "../schedule/cron.js";
import { listScheduleRuns } from "../schedule/run-log.js";
import { loadSession } from "../sessions/store.js";
import { answerApproval, startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";
import { resolveCron } from "./schedule-control-api.js";
import { setScheduleRunnerFactory } from "./schedule-trigger.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { setScheduleRunnerFactory(null); await h.stop(); });

const list = async () => (await h.get("/api/schedules")).body as Array<{ id: number; status: string; cron: string; instruction: string; scriptSha256?: string }>;

describe("schedule write routes", () => {
  it("creates, edits, pauses, resumes and deletes a plain schedule in the shared store", async () => {
    const made = (await h.post("/api/schedules/create", { cron: "0 9 * * 1-5", instruction: "check leads" })).body;
    expect(made.schedule).toMatchObject({ id: 1, status: "active", cron: "0 9 * * 1-5" });

    expect((await h.post("/api/schedules/update", { id: 1, when: "every 2 hours", instruction: "check leads twice" })).status).toBe(200);
    expect(await list()).toMatchObject([{ id: 1, cron: "0 */2 * * *", instruction: "check leads twice" }]);

    await h.post("/api/schedules/pause", { id: 1 });
    expect((await list())[0]?.status).toBe("paused");
    await h.post("/api/schedules/resume", { id: 1 });
    expect((await list())[0]?.status).toBe("active");

    expect((await h.post("/api/schedules/delete", { id: 1 })).body).toMatchObject({ ok: true, id: 1 });
    expect(await list()).toEqual([]);
  });

  it("rejects malformed schedules and unknown ids with actionable errors", async () => {
    expect((await h.post("/api/schedules/create", { cron: "61 * * * *", instruction: "x" })).body.error).toMatch(/5 valid fields/);
    expect((await h.post("/api/schedules/create", { when: "whenever", instruction: "x" })).status).toBe(400);
    expect((await h.post("/api/schedules/create", { instruction: "x" })).body.error).toMatch(/cron or when/);
    expect((await h.post("/api/schedules/pause", { id: 99 })).status).toBe(404);
    expect((await h.post("/api/schedules/update", { id: 1 })).status).toBe(400);
    expect(resolveCron({ when: "every day at 9:00" })).toEqual({ cron: "0 9 * * *" });
  });

  it("creates a script schedule only after approval and binds the approved bytes", async () => {
    const pending = h.post("/api/schedules/create", { cron: "*/5 * * * *", instruction: "disk check", mode: "no_agent", script: "df -h" });
    const shown = await answerApproval(h, "allow");
    expect(shown).toMatchObject({ toolName: "schedule_script" });
    expect(shown.action).toContain("df -h");
    expect((await pending).status).toBe(200);
    const [entry] = await loadCron(dataDirFor(h.root));
    expect(entry && scriptAuthorityValid(entry)).toBe(true);
  });

  it("creates nothing when the script approval is denied", async () => {
    const pending = h.post("/api/schedules/create", { cron: "*/5 * * * *", instruction: "x", mode: "no_agent", script: "rm -rf /tmp/x" });
    await answerApproval(h, "deny");
    expect((await pending).status).toBe(403);
    expect(await list()).toEqual([]);
  });

  it("re-approves a script that changed, and when a script schedule is resumed", async () => {
    const created = h.post("/api/schedules/create", { cron: "0 * * * *", instruction: "report", mode: "script_context", script: "echo one" });
    await answerApproval(h, "allow");
    await created;
    const before = (await list())[0]?.scriptSha256;

    const changed = h.post("/api/schedules/update", { id: 1, script: "echo two" });
    expect((await answerApproval(h, "allow")).action).toContain("echo two");
    await changed;
    expect((await list())[0]?.scriptSha256).not.toBe(before);

    await h.post("/api/schedules/pause", { id: 1 });
    const resumed = h.post("/api/schedules/resume", { id: 1 });
    await answerApproval(h, "allow");
    expect((await resumed).status).toBe(200);
    expect((await list())[0]?.status).toBe("active");
  });

  it("leaves a paused script schedule paused when resume approval is denied", async () => {
    const created = h.post("/api/schedules/create", { cron: "0 * * * *", instruction: "r", mode: "no_agent", script: "echo hi" });
    await answerApproval(h, "allow");
    await created;
    await h.post("/api/schedules/pause", { id: 1 });
    const resumed = h.post("/api/schedules/resume", { id: 1 });
    await answerApproval(h, "deny");
    expect((await resumed).status).toBe(403);
    expect((await list())[0]?.status).toBe("paused");
  });

  it("refuses to edit durable agent tasks", async () => {
    await mkdir(dataDirFor(h.root), { recursive: true });
    await writeFile(join(dataDirFor(h.root), "scheduled_tasks.json"), JSON.stringify({ tasks: [{ id: 7, cron: "0 * * * *", instruction: "durable", status: "active", durable: true, recurring: true }] }));
    expect((await h.post("/api/schedules/delete", { id: 7 })).status).toBe(409);
  });
});

describe("schedule trigger, runs and blueprints", () => {
  it("runs a schedule now, saves an openable run session, and lists the run", async () => {
    await h.post("/api/schedules/create", { cron: "0 9 * * *", instruction: "summarise inbox" });
    setScheduleRunnerFactory(async () => ({ run: async (instruction) => ({ finalText: `done: ${instruction}` }), runScript: async () => ({ ok: true, output: "" }) }));

    const triggered = (await h.post("/api/schedules/trigger", { id: 1 })).body;
    expect(triggered).toMatchObject({ ok: true, result: "done: summarise inbox" });

    const runs = (await h.get("/api/schedules/1/runs?limit=5")).body.runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ jobId: 1, trigger: "manual", ok: true });
    const session = await loadSession(runs[0].sessionId, process.env);
    expect(session?.messages.map((m) => m.content)).toEqual(["summarise inbox", "done: summarise inbox"]);
    expect(await listScheduleRuns(dataDirFor(h.root), 1)).toHaveLength(1);
  });

  it("records a failed run honestly and refuses an unauthorised script", async () => {
    await h.post("/api/schedules/create", { cron: "0 9 * * *", instruction: "boom" });
    setScheduleRunnerFactory(async () => ({ run: async () => { throw new Error("provider down"); }, runScript: async () => ({ ok: true, output: "" }) }));
    const failed = (await h.post("/api/schedules/trigger", { id: 1 })).body;
    expect(failed).toMatchObject({ ok: true, result: "error: provider down" });
    expect((await h.get("/api/schedules/1/runs")).body.runs[0].ok).toBe(false);

    const { addCron } = await import("../schedule/cron.js");
    await addCron(dataDirFor(h.root), "0 9 * * *", "bare", { mode: "no_agent" });
    expect((await h.post("/api/schedules/trigger", { id: 2 })).status).toBe(409);
    expect((await h.post("/api/schedules/trigger", { id: 42 })).status).toBe(404);
  });

  it("lists schedule blueprints and instantiates one into a real schedule", async () => {
    const blueprints = (await h.get("/api/schedules/blueprints")).body.blueprints;
    expect(blueprints.map((b: { name: string }) => b.name)).toContain("daily-brief");
    const made = await h.post("/api/schedules/blueprints/instantiate", { blueprint: "daily-brief", values: { topic: "AI policy" } });
    expect(made.status).toBe(200);
    expect((await list()).length).toBe(1);
    expect((await h.post("/api/schedules/blueprints/instantiate", { blueprint: "ghost" })).status).toBe(404);
  });
});
