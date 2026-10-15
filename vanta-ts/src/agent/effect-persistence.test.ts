import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  persistApprovalTransition,
  persistEffectTransition,
} from "./effect-persistence.js";

describe("effect persistence emits the canonical WorkItem/Run/Receipt facade", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-work-item-events-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("records queued, running, and truthful settled state without arguments or outputs", async () => {
    const call = { id: "call-1", name: "gmail_send", arguments: { body: "secret" } };
    await persistEffectTransition(root, "session-1", call, "pending");
    await persistEffectTransition(root, "session-1", call, "started");
    await persistEffectTransition(root, "session-1", call, "settled", "confirmed", "unverified");

    const items = (await readFile(join(root, ".vanta", "work-items.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(items.map((item) => item.state)).toEqual(["queued", "running", "unverified"]);
    expect(JSON.stringify(items)).not.toContain("secret");

    const receipts = (await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      workItemId: "session-1:call-1",
      runId: "session-1:call-1",
      action: "gmail_send",
      disposition: "confirmed",
      verification: "unverified",
    });
    const effectEnvelopes = await readdir(join(root, ".vanta", "effect-journal", "applied"));
    const effectJournal = await Promise.all(effectEnvelopes.map((file) => (
      readFile(join(root, ".vanta", "effect-journal", "applied", file), "utf8")
    )));
    expect(effectJournal.join("\n")).not.toContain("secret");
  });

  it("records approval state without persisting the sensitive action text", async () => {
    const call = { id: "call-approval", name: "gmail_send", arguments: {} };
    const action = "send private body token-super-secret to the operator";

    await persistApprovalTransition(root, "session-1", call, action, "requested");
    await persistApprovalTransition(root, "session-1", call, action, "approved");

    const approvalsRaw = await readFile(join(root, ".vanta", "approvals.jsonl"), "utf8");
    const approvals = approvalsRaw.trim().split("\n").map((line) => JSON.parse(line));
    expect(approvals.map((approval) => approval.state)).toEqual(["requested", "approved"]);
    expect(approvals[0]).toMatchObject({
      workItemId: "session-1:call-approval",
      runId: "session-1:call-approval",
    });
    expect(approvals[0].actionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(approvalsRaw).not.toContain("token-super-secret");
    const approvalEnvelopes = await readdir(join(root, ".vanta", "effect-journal", "applied"));
    const approvalJournal = await Promise.all(approvalEnvelopes.map((file) => (
      readFile(join(root, ".vanta", "effect-journal", "applied", file), "utf8")
    )));
    expect(approvalJournal.join("\n")).not.toContain("token-super-secret");

    const items = (await readFile(join(root, ".vanta", "work-items.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(items.map((item) => item.state)).toEqual(["needs human", "queued"]);
  });

  it("retains a durable settlement envelope and replays a failed projection", async () => {
    const vantaDir = join(root, ".vanta");
    await mkdir(join(vantaDir, "work-items.jsonl"), { recursive: true });
    const call = { id: "call-recover", name: "gmail_send", arguments: { body: "secret" } };

    await persistEffectTransition(root, "session-1", call, "settled", "confirmed", "unverified");

    const pendingDir = join(vantaDir, "effect-journal", "pending");
    expect(await readdir(pendingDir)).toHaveLength(1);
    await expect(readFile(join(vantaDir, "action-receipts.jsonl"), "utf8")).rejects.toThrow();

    await rm(join(vantaDir, "work-items.jsonl"), { recursive: true });
    await persistEffectTransition(
      root,
      "session-1",
      { id: "call-next", name: "read_file", arguments: {} },
      "pending",
    );

    expect(await readdir(pendingDir)).toHaveLength(0);
    expect(await readdir(join(vantaDir, "effect-journal", "applied"))).toHaveLength(2);
    const receipt = JSON.parse((await readFile(join(vantaDir, "action-receipts.jsonl"), "utf8")).trim());
    expect(receipt).toMatchObject({
      workItemId: "session-1:call-recover",
      disposition: "confirmed",
      verification: "unverified",
    });
  });

  it("fails closed before projections when the durable journal cannot be created", async () => {
    const vantaDir = join(root, ".vanta");
    await mkdir(vantaDir, { recursive: true });
    await writeFile(join(vantaDir, "effect-journal"), "not-a-directory", "utf8");
    const call = { id: "call-no-journal", name: "gmail_send", arguments: {} };

    await expect(
      persistEffectTransition(root, "session-1", call, "settled", "confirmed", "unverified"),
    ).rejects.toThrow();
    await expect(readFile(join(vantaDir, "tool-effects.jsonl"), "utf8")).rejects.toThrow();
  });

  it("waits for the cross-process journal writer lock before projecting", async () => {
    const journalDir = join(root, ".vanta", "effect-journal");
    await mkdir(journalDir, { recursive: true });
    const lockPath = join(journalDir, "writer.lock");
    await writeFile(lockPath, JSON.stringify({
      version: 1,
      pid: process.pid,
      token: "other-writer",
      acquiredAt: new Date().toISOString(),
    }), "utf8");
    let settled = false;
    const persistence = persistEffectTransition(
      root,
      "session-1",
      { id: "call-locked", name: "gmail_send", arguments: {} },
      "pending",
    ).finally(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(settled).toBe(false);
    await expect(readFile(join(root, ".vanta", "tool-effects.jsonl"), "utf8")).rejects.toThrow();

    await rm(lockPath);
    await persistence;
    expect(await readFile(join(root, ".vanta", "tool-effects.jsonl"), "utf8"))
      .toContain("\"toolCallId\":\"call-locked\"");
  });
});
