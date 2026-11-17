import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { buildOperatorSpine, formatOperatorSpine } from "./operator-spine.js";

it.each([
  ["needs human", "unknown", "turn-1", "Execute cli.turn", true, false],
  ["needs human", "none", "turn-1", "Execute cli.turn", false, false],
  ["unverified", "unknown", "turn-1", "Execute cli.turn", false, false],
  ["needs human", "unknown", "other-chat:turn-1", "Execute cli.turn", false, false],
  ["needs human", "unknown", "turn-1", "Inspect Gmail Sent before resuming", false, false],
  ["needs human", "unknown", "turn-1", "Execute cli.turn", false, true],
])("uses only matching uncertain terminal evidence: %s %s %s %s", async (state, disposition, workItemId, outcome, reviewed, laterReceipt) => {
  const root = await mkdtemp(join(tmpdir(), "vanta-review-view-")), data = join(root, ".vanta");
  await mkdir(data);
  const at = "2026-10-28T12:00:00.000Z";
  const item = { version: 1, id: "turn-1", outcome, state, source: "tool-call", runId: "run-1", updatedAt: at };
  const receipt = { version: 1, id: "receipt-1", workItemId, runId: "run-1", action: "cli.turn", disposition, at };
  await writeFile(join(data, "work-items.jsonl"), JSON.stringify(item) + "\n");
  const receiptBytes = [receipt, ...(laterReceipt ? [{ ...receipt, id: "receipt-2", disposition: "confirmed", at: "2026-10-28T12:01:00.000Z" }] : [])].map(row => JSON.stringify(row)).join("\n") + "\n";
  await writeFile(join(data, "action-receipts.jsonl"), receiptBytes);
  const snapshot = await buildOperatorSpine(root, { env: { VANTA_HOME: join(root, "home") } });
  expect(snapshot.workItems[0]?.item.outcome).toBe(reviewed ? "Check whether the action completed" : outcome);
  expect(snapshot.views.needsYou).toHaveLength(state === "needs human" ? 1 : 0);
  expect(await readFile(join(data, "work-items.jsonl"), "utf8")).toBe(JSON.stringify(item) + "\n");
  expect(await readFile(join(data, "action-receipts.jsonl"), "utf8")).toBe(receiptBytes);
});

it("does not render terminal controls or injected lines from attention text", () => {
  const field = "Review\u001b[2J\u001b]52;c;secret\u0007\nforged\tline\u2028last";
  const snapshot = { integrity: "ok", views: { captured: [], now: [], waiting: [], done: [], needsYou: [
    { source: { id: field }, item: { outcome: field, blocker: field, nextAction: field } },
  ] }, sources: [], digest: "digest" } as unknown as Awaited<ReturnType<typeof buildOperatorSpine>>;
  const shown = formatOperatorSpine(snapshot);
  expect(shown).toContain("Needs you: Review forged line last");
  expect(shown).not.toMatch(/[\u001b\u0007\t\u2028]/);
  expect(shown).not.toContain("\nforged");
});
