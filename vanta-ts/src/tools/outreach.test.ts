import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outreachTool } from "./outreach.js";
import { listDrafts, readProof, setWorkspace } from "../outreach/store.js";
import type { ToolContext } from "./types.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vanta-outreach-tool-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(approve = true): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => approve) };
}

const dataDir = () => join(root, ".vanta");

describe("outreach tool — draft & approve", () => {
  it("draft creates a draft and never sends", async () => {
    const r = await outreachTool.execute(
      { action: "draft", to: "a@x.com", channel: "email", body: "hi", batchId: "b1" },
      ctx(),
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("status: draft");
    const drafts = await listDrafts(dataDir());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe("draft");
  });

  it("approve_batch calls requestApproval and only then approves", async () => {
    await outreachTool.execute({ action: "draft", to: "a@x.com", channel: "email", body: "1", batchId: "b1" }, ctx());
    const c = ctx(true);
    const r = await outreachTool.execute({ action: "approve_batch", batchId: "b1" }, c);
    expect(c.requestApproval).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
    expect((await listDrafts(dataDir()))[0]?.status).toBe("approved");
  });

  it("approve_batch denied leaves drafts as draft (no send path)", async () => {
    await outreachTool.execute({ action: "draft", to: "a@x.com", channel: "email", body: "1", batchId: "b1" }, ctx());
    const r = await outreachTool.execute({ action: "approve_batch", batchId: "b1" }, ctx(false));
    expect(r.ok).toBe(false);
    expect(r.output).toBe("denied");
    expect((await listDrafts(dataDir()))[0]?.status).toBe("draft");
  });

  it("approve_batch on an empty batch reports nothing pending (no approval prompt)", async () => {
    const c = ctx(true);
    const r = await outreachTool.execute({ action: "approve_batch", batchId: "nope" }, c);
    expect(r.ok).toBe(false);
    expect(c.requestApproval).not.toHaveBeenCalled();
  });
});

describe("outreach tool — ledger & validation", () => {
  it("reply records a received proof entry", async () => {
    const r = await outreachTool.execute({ action: "reply", ref: "draft-1", note: "yes" }, ctx());
    expect(r.ok).toBe(true);
    const proof = await readProof(dataDir());
    expect(proof.map((p) => p.kind)).toEqual(["received"]);
  });

  it("proof appends a changed entry", async () => {
    await outreachTool.execute({ action: "proof", kind: "changed", ref: "draft-1", note: "edited" }, ctx());
    const proof = await readProof(dataDir());
    expect(proof[0]?.kind).toBe("changed");
  });

  it("rejects invalid args as a value (never throws)", async () => {
    const r = await outreachTool.execute({ action: "bogus" }, ctx());
    expect(r.ok).toBe(false);
  });
});

describe("outreach tool — identity & safety", () => {
  it("list surfaces the configured brand identity (never fabricated)", async () => {
    await setWorkspace(dataDir(), { brandName: "Theft Studio", fromHandle: "hi@theft.studio" });
    const r = await outreachTool.execute({ action: "list" }, ctx());
    expect(r.output).toContain("Theft Studio <hi@theft.studio>");
  });

  it("describeForSafety surfaces action + recipient count, never the body", () => {
    const desc = outreachTool.describeForSafety?.({
      action: "draft",
      to: "a@x.com",
      body: "SECRET BODY TEXT",
    });
    expect(desc).toContain("draft outreach message");
    expect(desc).toContain("1 recipient");
    expect(desc).not.toContain("SECRET BODY TEXT");
  });

  it("describeForSafety names the batch for approval routing", () => {
    expect(outreachTool.describeForSafety?.({ action: "approve_batch", batchId: "b1" })).toContain("b1");
  });
});
