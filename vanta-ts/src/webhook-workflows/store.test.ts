import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createWorkflow, findWorkflow, listReceipts, listWorkflows, readWorkflowSecret, setWorkflowEnabled,
} from "./store.js";
import { WEBHOOK_TEMPLATES } from "./templates.js";

let dataDir = "";
afterEach(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

describe("webhook workflow store", () => {
  it("publishes GitHub PR, email, subscriber/form, and generic HMAC templates", () => {
    expect(Object.keys(WEBHOOK_TEMPLATES)).toEqual(["github-pr", "email", "subscriber", "generic"]);
    for (const template of Object.values(WEBHOOK_TEMPLATES)) {
      expect(() => JSON.parse(template.samplePayload)).not.toThrow();
      expect(template.prompt).toContain("{body}");
    }
  });

  it("creates a disabled workflow, isolates its secret, and stores dry-run receipts", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-workflow-"));
    const created = await createWorkflow(dataDir, {
      id: "review-pr", name: "Review PR", template: "github-pr", deliver: "file:out.log",
      secret: "test-secret", now: new Date("2026-07-11T12:00:00.000Z"),
    });
    expect(created.workflow).toMatchObject({
      id: "review-pr", route: "/webhooks/review-pr", enabled: false, template: "github-pr",
    });
    expect(created.samplePayload).toContain("pull_request");
    expect(await readWorkflowSecret(dataDir, "review-pr")).toBe("test-secret");
    const secretStat = await stat(join(dataDir, "webhook-workflows", "secrets", "review-pr"));
    expect(secretStat.mode & 0o777).toBe(0o600);
    expect(await listWorkflows(dataDir)).toHaveLength(1);
    expect(await listReceipts(dataDir, "review-pr")).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "route", ok: true }),
      expect.objectContaining({ phase: "delivery", ok: true }),
      expect.objectContaining({ phase: "dry-run", ok: true }),
    ]));
  });

  it("enables and disables a workflow without changing its route", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-workflow-"));
    await createWorkflow(dataDir, { id: "signup", name: "Signup", template: "subscriber", secret: "s" });
    expect((await setWorkflowEnabled(dataDir, "signup", true))?.enabled).toBe(true);
    expect((await findWorkflow(dataDir, "signup"))?.route).toBe("/webhooks/signup");
    expect((await setWorkflowEnabled(dataDir, "signup", false))?.enabled).toBe(false);
    expect(await setWorkflowEnabled(dataDir, "missing", true)).toBeNull();
  });

  it("rejects duplicate ids and unsafe ids", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-workflow-"));
    await createWorkflow(dataDir, { id: "safe-id", name: "Safe", template: "generic", secret: "s" });
    await expect(createWorkflow(dataDir, { id: "safe-id", name: "Again", template: "generic", secret: "s" })).rejects.toThrow(/already exists/);
    await expect(createWorkflow(dataDir, { id: "../escape", name: "Bad", template: "generic", secret: "s" })).rejects.toThrow(/id/i);
  });
});
