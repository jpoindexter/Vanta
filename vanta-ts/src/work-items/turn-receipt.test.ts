import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { goalWorkItemState } from "../goals/progress.js";
import { readWorkItemProjection } from "./read-model.js";
import { recordTurnReceipt } from "./turn-receipt.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-turn-receipt-"));
  roots.push(value);
  return value;
}

describe("uncertain turn identity", () => {
  it("uses the complete operation set without retaining raw IDs or mutating caller input", async () => {
    const projectRoot = await root();
    const callIds = ["private-call-b", "private-call-a", "private-call-b"];
    const input = { root: projectRoot, sessionId: "same-chat", host: "desktop",
      completionState: "needs human" as const, disposition: "unknown" as const };
    await recordTurnReceipt({ ...input, reviewCallIds: callIds });
    await recordTurnReceipt({ ...input, reviewCallIds: ["private-call-a", "private-call-b"] });
    expect(callIds).toEqual(["private-call-b", "private-call-a", "private-call-b"]);
    const projection = await readWorkItemProjection(projectRoot);
    expect(projection.items).toHaveLength(1);
    expect(JSON.stringify(projection)).not.toContain("private-call");
    const rows = (await readFile(join(projectRoot, ".vanta/work-items.jsonl"), "utf8")).trim().split("\n").map(row => JSON.parse(row));
    expect(rows.map(row => row.state)).toEqual(["needs human", "needs human"]);
    await recordTurnReceipt({ ...input, reviewCallIds: ["private-call-a"] });
    expect((await readWorkItemProjection(projectRoot)).items).toHaveLength(2);
  });
});

describe("unbound turn identity", () => {
  it.each([
    { sessionId: undefined },
    { reviewCallIds: undefined },
    { completionState: "unverified" as const, disposition: "none" as const },
  ])("keeps repeated unbound or ordinary turns distinct: %j", async change => {
    const projectRoot = await root();
    const input = { root: projectRoot, sessionId: "chat", host: "desktop",
      completionState: "needs human" as const, disposition: "unknown" as const, reviewCallIds: ["call"], ...change };
    await recordTurnReceipt(input);
    await recordTurnReceipt(input);
    expect((await readWorkItemProjection(projectRoot)).items).toHaveLength(2);
  });
});

describe("recordTurnReceipt", () => {
  it.each([
    ["different host", { host: "cli" }],
    ["different chat", { sessionId: "another-chat" }],
    ["different goal", { goalId: "another-goal" }],
    ["no session", { sessionId: undefined }],
    ["no call IDs", { reviewCallIds: undefined }],
    ["ordinary turn", { completionState: "unverified" as const, disposition: "none" as const }],
  ])("does not merge %s", async (_label, change) => {
    const projectRoot = await root();
    const input = { root: projectRoot, sessionId: "chat", host: "desktop", goalId: "goal",
      completionState: "needs human" as const, disposition: "unknown" as const, reviewCallIds: ["call"] };
    await recordTurnReceipt(input);
    await recordTurnReceipt({ ...input, ...change });
    expect((await readWorkItemProjection(projectRoot)).items).toHaveLength(2);
  });

  it("persists one verified receipt and links the same WorkItem to goal progress", async () => {
    const projectRoot = await root();
    await recordTurnReceipt({
      root: projectRoot,
      sessionId: "desktop-session",
      host: "desktop",
      goalId: "42",
      completionState: "verified",
    });

    const projection = await readWorkItemProjection(projectRoot);
    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      source: "tool-call",
      state: "verified",
      runId: projection.items[0]?.id,
    });
    expect(projection.items[0]?.id).toContain(":goal:42:turn:");
    expect(goalWorkItemState(42, projection.items)).toBe("verified");

    const receipts = (await readFile(join(projectRoot, ".vanta", "action-receipts.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      workItemId: projection.items[0]?.id,
      runId: projection.items[0]?.id,
      action: "desktop.turn",
      disposition: "none",
      verification: "verified",
    });
  });
});

describe("recordTurnReceipt disposition", () => {
  it("keeps an explicit disposition separate from an unverified completion state", async () => {
    const projectRoot = await root();
    await recordTurnReceipt({
      root: projectRoot,
      host: "messaging",
      completionState: "unverified",
      disposition: "confirmed",
    });

    const projection = await readWorkItemProjection(projectRoot);
    expect(projection.items[0]?.state).toBe("unverified");
    const receipt = JSON.parse((await readFile(join(projectRoot, ".vanta", "action-receipts.jsonl"), "utf8")).trim());
    expect(receipt).toMatchObject({ disposition: "confirmed", verification: "unverified" });
  });

  it("does not reinterpret an ordinary stopped turn as an approval denial", async () => {
    const projectRoot = await root();
    await recordTurnReceipt({ root: projectRoot, host: "jobs", completionState: "stopped" });

    const projection = await readWorkItemProjection(projectRoot);
    expect(projection.items[0]?.state).toBe("stopped");
    const receipt = JSON.parse((await readFile(join(projectRoot, ".vanta", "action-receipts.jsonl"), "utf8")).trim());
    expect(receipt).toMatchObject({ disposition: "none" });
    expect(receipt).not.toHaveProperty("verification");
  });
});
