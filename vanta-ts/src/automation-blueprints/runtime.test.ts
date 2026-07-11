import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAutomationBlueprint } from "./catalog.js";
import { applyAutomation, listAutomations, listAutomationReceipts, setAutomationStatus, testAutomation } from "./runtime.js";
import { loadCron } from "../schedule/cron.js";
import { findWorkflow } from "../webhook-workflows/store.js";

let dataDir = "";
afterEach(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

describe("automation blueprint runtime", () => {
  it("requires confirmation before creating schedule state", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-data-"));
    const blueprint = await getAutomationBlueprint("daily-brief", process.env);
    await expect(applyAutomation(dataDir, blueprint!, { cron: "0 8 * * *", topic: "today" }, { confirmed: false }))
      .rejects.toThrow("confirmation required");
    expect(await loadCron(dataDir)).toHaveLength(0);
  });

  it("creates, pauses, resumes, tests, and receipts a scheduled automation", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-data-"));
    const blueprint = await getAutomationBlueprint("daily-brief", process.env);
    const created = await applyAutomation(dataDir, blueprint!, { cron: "0 8 * * *", topic: "today" }, { confirmed: true, now: new Date("2026-07-11T12:00:00Z") });
    expect(created.kind).toBe("schedule");
    expect(await loadCron(dataDir)).toMatchObject([{ status: "active", cron: "0 8 * * *" }]);
    expect((await listAutomations(dataDir))[0]).toMatchObject({ blueprint: "daily-brief", status: "active" });
    await setAutomationStatus(dataDir, created.id, "paused");
    expect((await loadCron(dataDir))[0]?.status).toBe("paused");
    await setAutomationStatus(dataDir, created.id, "active");
    expect((await testAutomation(dataDir, created.id)).status).toBe("passed");
    expect((await listAutomationReceipts(dataDir, created.id)).map((item) => item.action)).toEqual(["created", "paused", "resumed", "tested"]);
  });

  it("creates a disabled signed webhook and controls it through one automation id", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-auto-data-"));
    const blueprint = await getAutomationBlueprint("github-pr-review", process.env);
    const created = await applyAutomation(dataDir, blueprint!, { id: "review-pr", deliver: "local" }, { confirmed: true });
    expect(created).toMatchObject({ kind: "webhook", targetId: "review-pr", status: "paused" });
    expect((await findWorkflow(dataDir, "review-pr"))?.enabled).toBe(false);
    await setAutomationStatus(dataDir, created.id, "active");
    expect((await findWorkflow(dataDir, "review-pr"))?.enabled).toBe(true);
  });
});
