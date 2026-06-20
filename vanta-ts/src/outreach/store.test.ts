import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setWorkspace,
  getWorkspace,
  draftMessage,
  approveBatch,
  markSent,
  recordReply,
  appendProof,
  readProof,
  listDrafts,
  pendingBatch,
} from "./store.js";

let dir: string;
const at = (iso: string) => () => new Date(iso);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-outreach-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("outreach workspace identity", () => {
  it("stores the configured brand identity, never fabricates one", async () => {
    expect(await getWorkspace(dir)).toBeNull(); // no fabricated default
    const ws = await setWorkspace(dir, { brandName: "Theft Studio", fromHandle: "hello@theft.studio" });
    expect(ws).toEqual({ brandName: "Theft Studio", fromHandle: "hello@theft.studio" });
    expect(await getWorkspace(dir)).toEqual(ws);
  });
});

describe("draftMessage", () => {
  it("creates a message as draft — never auto-sent", async () => {
    const d = await draftMessage(dir, { to: "a@x.com", channel: "email", body: "hi" });
    expect(d.status).toBe("draft");
    expect(d.id).toBeTruthy();
    const all = await listDrafts(dir);
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("draft");
    // No draft in the store is ever born `sent` or `approved`.
    expect(all.every((x) => x.status === "draft")).toBe(true);
  });
});

describe("approveBatch", () => {
  it("moves a batch's drafts draft→approved (the only transition toward sending)", async () => {
    await draftMessage(dir, { to: "a@x.com", channel: "email", body: "1", batchId: "b1" });
    await draftMessage(dir, { to: "b@x.com", channel: "email", body: "2", batchId: "b1" });
    await draftMessage(dir, { to: "c@x.com", channel: "email", body: "3", batchId: "b2" });

    expect(await pendingBatch(dir, "b1")).toHaveLength(2);
    const approved = await approveBatch(dir, "b1");
    expect(approved).toHaveLength(2);
    expect(approved.every((d) => d.status === "approved")).toBe(true);

    expect(await pendingBatch(dir, "b1")).toHaveLength(0); // none still pending
    const b2 = (await listDrafts(dir)).filter((d) => d.batchId === "b2");
    expect(b2[0]?.status).toBe("draft"); // other batch untouched
  });
});

describe("proof ledger", () => {
  it("records an inbound reply as a received entry", async () => {
    const p = await recordReply(dir, "draft-1", "they said yes");
    expect(p.kind).toBe("received");
    expect(p.ref).toBe("draft-1");
    const ledger = await readProof(dir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.kind).toBe("received");
  });

  it("records sent / received / changed entries, append-only in order", async () => {
    await appendProof(dir, { kind: "changed", ref: "draft-1", note: "edited body" }, at("2026-01-01T00:00:00Z"));
    await recordReply(dir, "draft-1", "reply", at("2026-01-02T00:00:00Z"));
    const d = await draftMessage(dir, { to: "a@x.com", channel: "email", body: "hi", batchId: "bx" });
    await approveBatch(dir, "bx");
    await markSent(dir, d.id, at("2026-01-03T00:00:00Z"));

    const kinds = (await readProof(dir)).map((p) => p.kind);
    expect(kinds).toEqual(["changed", "received", "sent"]); // append-only, chronological
  });
});

describe("no-autonomous-send invariant", () => {
  it("refuses to mark a draft sent without a prior approved state", async () => {
    const d = await draftMessage(dir, { to: "a@x.com", channel: "email", body: "hi", batchId: "b1" });
    // Straight from draft → sent must be impossible.
    const r = await markSent(dir, d.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("approved");

    // Still a draft, never silently flipped to sent; no proof "sent" written.
    expect((await listDrafts(dir))[0]?.status).toBe("draft");
    expect((await readProof(dir)).some((p) => p.kind === "sent")).toBe(false);
  });

  it("only allows sent after approveBatch, and that send records a proof sent entry", async () => {
    const d = await draftMessage(dir, { to: "a@x.com", channel: "email", body: "hi", batchId: "b1" });
    await approveBatch(dir, "b1");
    const r = await markSent(dir, d.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.status).toBe("sent");

    const sentProofs = (await readProof(dir)).filter((p) => p.kind === "sent");
    expect(sentProofs).toHaveLength(1);
    expect(sentProofs[0]?.ref).toBe(d.id);
  });

  it("never produces a sent draft for any draft that was never approved", async () => {
    // Exhaustive over the lifecycle: a draft that never passed through approval
    // can NEVER reach `sent`, no matter the call order.
    const draft = await draftMessage(dir, { to: "a@x.com", channel: "email", body: "x", batchId: "skip" });
    await markSent(dir, draft.id); // attempt before approval — refused
    await markSent(dir, draft.id); // retry — still refused
    const sentDrafts = (await listDrafts(dir)).filter((x) => x.status === "sent");
    expect(sentDrafts).toHaveLength(0);
  });
});

describe("tolerant store", () => {
  it("returns empty state on a corrupt workspace file rather than throwing", async () => {
    await mkdir(join(dir, "outreach"), { recursive: true });
    await writeFile(join(dir, "outreach", "workspace.json"), "{ not json", "utf8");
    expect(await getWorkspace(dir)).toBeNull();
    expect(await listDrafts(dir)).toEqual([]);
  });

  it("skips a corrupt proof line without losing the rest", async () => {
    await mkdir(join(dir, "outreach"), { recursive: true });
    await appendProof(dir, { kind: "sent", ref: "r1" });
    await writeFile(join(dir, "outreach", "proof.jsonl"), "{bad}\n", { flag: "a" });
    await appendProof(dir, { kind: "received", ref: "r2" });
    const ledger = await readProof(dir);
    expect(ledger.map((p) => p.ref)).toEqual(["r1", "r2"]);
  });
});
