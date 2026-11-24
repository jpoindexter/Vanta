import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConversation } from "../agent.js";
import type { LLMProvider } from "../providers/interface.js";
import { InMemoryToolRegistry } from "../tools/registry.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("agent turn receipt integration", () => {
  it.each([
    ["desktop", "desktop"],
    ["one-shot", "cli"],
    ["tui", "tui"],
    ["messaging", "messaging"],
    ["jobs", "jobs"],
  ])("persists one content-free receipt through the %s host boundary", async (usageAgent, receiptHost) => {
    const root = await mkdtemp(join(tmpdir(), "vanta-agent-receipt-"));
    roots.push(root);
    const secretPrompt = "private operator content must not enter the receipt";
    const provider: LLMProvider = {
      complete: async () => ({ text: "A claim without tool evidence", toolCalls: [], finishReason: "stop" }),
      modelId: () => "fixture",
      contextWindow: () => 32_000,
    };
    const outcome = await createConversation("system", {
      root,
      sessionId: "host-session",
      usageAgent,
      usageTaskId: "42",
      provider,
      safety: { logEvent: async () => {} } as never,
      registry: new InMemoryToolRegistry(),
      requestApproval: async () => false,
    }).send(secretPrompt);

    expect(outcome.completionState).toBe("unverified");
    const receipts = (await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      action: `${receiptHost}.turn`,
      disposition: "none",
      verification: "unverified",
    });
    expect(receipts[0].workItemId).toContain(":goal:42:turn:");
    expect(JSON.stringify(receipts)).not.toContain(secretPrompt);
  });
});
