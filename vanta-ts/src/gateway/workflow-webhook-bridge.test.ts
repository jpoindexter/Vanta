import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkflow, setWorkflowEnabled } from "../webhook-workflows/store.js";
import { startWorkflowWebhooks } from "./run.js";

let dataDir = "";
afterEach(async () => { if (dataDir) await rm(dataDir, { recursive: true, force: true }); });

describe("gateway workflow webhook bridge", () => {
  it("starts only when an enabled workflow and gateway handle are present", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-gateway-workflow-"));
    await createWorkflow(dataDir, { id: "event", name: "Event", template: "generic", secret: "s" });
    const base = { dataDir, workflowWebhooks: { port: 0, resolveDeliver: () => async () => {} } };
    expect(await startWorkflowWebhooks(base, () => {})).toBeUndefined();
    expect(await startWorkflowWebhooks({ ...base, handle: async () => "ok" }, () => {})).toBeUndefined();
    await setWorkflowEnabled(dataDir, "event", true);
    const server = await startWorkflowWebhooks({ ...base, handle: async () => "ok" }, () => {});
    expect(server?.port).toBeGreaterThan(0);
    await server?.close();
  });
});
