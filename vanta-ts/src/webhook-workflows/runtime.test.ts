import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkflow, listReceipts, setWorkflowEnabled } from "./store.js";
import { startWorkflowWebhookServer, type WorkflowWebhookServer } from "./runtime.js";

let dataDir = "";
let server: WorkflowWebhookServer | undefined;
afterEach(async () => {
  if (server) await server.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

function signature(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("workflow webhook runtime", () => {
  it("routes an enabled signed event through the agent and delivery target with receipts", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-runtime-"));
    await createWorkflow(dataDir, { id: "pr", name: "PR", template: "github-pr", deliver: "capture:ops", secret: "hook-secret" });
    await setWorkflowEnabled(dataDir, "pr", true);
    const handle = vi.fn(async (prompt: string) => `handled:${prompt.includes("pull_request")}`);
    const delivered: string[] = [];
    server = await startWorkflowWebhookServer({
      port: 0, dataDir, handle,
      resolveDeliver: (target) => async (text) => { delivered.push(`${target}:${text}`); },
      log: () => {},
    });
    const body = '{"action":"opened","pull_request":{"title":"Fix"}}';
    const response = await fetch(`http://127.0.0.1:${server.port}/webhooks/pr`, {
      method: "POST", body, headers: { "x-hub-signature-256": signature("hook-secret", body) },
    });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(delivered).toEqual(["capture:ops:handled:true"]));
    await vi.waitFor(async () => expect((await listReceipts(dataDir, "pr")).some((item) => item.status === "delivered")).toBe(true));
    expect(handle).toHaveBeenCalledTimes(1);
    expect(await listReceipts(dataDir, "pr")).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "route", ok: true, status: "accepted" }),
      expect.objectContaining({ phase: "delivery", ok: true, status: "delivered" }),
    ]));
  });

  it("rejects bad signatures, disabled routes, unknown routes, and non-POST methods", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-webhook-runtime-"));
    await createWorkflow(dataDir, { id: "off", name: "Off", template: "generic", secret: "s" });
    const handle = vi.fn(async () => "no");
    server = await startWorkflowWebhookServer({ port: 0, dataDir, handle, resolveDeliver: () => async () => {}, log: () => {} });
    const base = `http://127.0.0.1:${server.port}`;
    expect((await fetch(`${base}/webhooks/off`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await fetch(`${base}/webhooks/missing`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await fetch(`${base}/webhooks/off`)).status).toBe(405);
    await setWorkflowEnabled(dataDir, "off", true);
    expect((await fetch(`${base}/webhooks/off`, { method: "POST", body: "{}" })).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });
});
