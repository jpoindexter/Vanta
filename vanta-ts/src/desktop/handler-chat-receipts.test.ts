import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionSchema } from "../sessions/session-schema.js";
import { createFsSessionStore } from "../sessions/store.js";
import { exportSession } from "../sessions/export.js";
import { buildRunReceipt, receiptStatusForStoppedReason } from "./handler-chat-receipts.js";

it("keeps the typed stop reason and exact checkpoint through saved-session validation", () => {
  const stoppedReason = "repeated_failure" as const;
  const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(stoppedReason), stoppedReason,
    events: [], instruction: "Research this request", partialText: "Already checked source A" });
  const restored = SessionSchema.parse(JSON.parse(JSON.stringify({
    id: "cold-recovery", title: "Recovery", started: "2026-10-25", updated: "2026-10-25",
    messages: [{ role: "assistant", content: "Already checked source A", desktopRun: receipt }],
  })));
  expect(restored.messages[0]).toMatchObject({ desktopRun: {
    status: "failed", stoppedReason, failureKind: "unknown",
    actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    checkpoint: { instruction: "Research this request", partialText: "Already checked source A" },
  } });
});

it("reopens the actual isolated session store and exports the same typed failure", async () => {
  const home = await mkdtemp(join(tmpdir(), "vanta-cold-receipt-"));
  const store = createFsSessionStore({ VANTA_HOME: home });
  const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason("tool_budget"),
    events: [], instruction: "Keep this exact request", partialText: "Kept partial" });
  try {
    await store.save("cold-receipt", [{ role: "user", content: "Keep this exact request" },
      { role: "assistant", content: "Kept partial", desktopRun: receipt }]);
    const reopened = await createFsSessionStore({ VANTA_HOME: home }).load("cold-receipt");
    expect(reopened).not.toBeNull();
    const exported = JSON.parse(exportSession(reopened!, "json").content);
    expect(exported.messages.at(-1).desktopRun).toEqual(receipt);
    expect(exported.messages.at(-1).desktopRun.stoppedReason).toBe("tool_budget");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it("keeps the producer-supplied displayed checkpoint verbatim", () => {
  const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason("repeated_failure"),
    events: [], instruction: "Current request", partialText: "Checked source A.\n\nStopped after repeated failures.",
  });
  expect(receipt.checkpoint).toEqual({ instruction: "Current request",
    partialText: "Checked source A.\n\nStopped after repeated failures." });
});
