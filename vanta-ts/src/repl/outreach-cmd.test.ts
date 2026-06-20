import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outreach } from "./outreach-cmd.js";
import { draftMessage, approveBatch, recordReply, setWorkspace } from "../outreach/store.js";
import type { ReplCtx } from "./types.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "vanta-outreach-cmd-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function ctx(): ReplCtx {
  return { dataDir } as unknown as ReplCtx;
}

describe("/outreach", () => {
  it("reports an empty workspace cleanly", async () => {
    const r = await outreach("", ctx());
    expect(r.output).toContain("(none configured");
    expect(r.output).toContain("Drafts: (none");
    expect(r.output).toContain("Proof ledger: (empty)");
  });

  it("shows the brand identity, pending drafts, and the proof ledger", async () => {
    await setWorkspace(dataDir, { brandName: "Theft Studio", fromHandle: "hi@theft.studio" });
    await draftMessage(dataDir, { to: "a@x.com", channel: "email", body: "1", batchId: "b1" });
    await draftMessage(dataDir, { to: "b@x.com", channel: "email", body: "2", batchId: "b1" });
    await approveBatch(dataDir, "b1");
    await draftMessage(dataDir, { to: "c@x.com", channel: "email", body: "3", batchId: "b2" });
    await recordReply(dataDir, "draft-x", "they replied");

    const r = await outreach("", ctx());
    expect(r.output).toContain("Theft Studio <hi@theft.studio>");
    // one still-draft (b2), two approved (b1) → 1 pending / 3 total
    expect(r.output).toContain("1 pending / 3 total");
    expect(r.output).toContain("Proof ledger (1)");
    expect(r.output).toContain("they replied");
  });
});
