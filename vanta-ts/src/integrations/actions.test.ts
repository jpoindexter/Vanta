import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeIntegrationAction } from "./actions.js";
import { readIntegrationReceipts } from "./receipts.js";

describe("integration actions", () => {
  let root = "";

  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it("records a redacted failure when a direct test lacks authorization", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-integration-action-"));
    await expect(executeIntegrationAction(root, "trello", "test", {})).rejects.toThrow("VANTA_TRELLO_KEY");
    expect(await readIntegrationReceipts(root)).toMatchObject([{ integration: "trello", action: "test", outcome: "failed" }]);
  });

  it("returns a setup hint without recording a fake successful connection", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-integration-action-"));
    await expect(executeIntegrationAction(root, "dropbox", "configure", {})).resolves.toContain("VANTA_DROPBOX_TOKEN");
    expect(await readIntegrationReceipts(root)).toEqual([]);
  });
});
