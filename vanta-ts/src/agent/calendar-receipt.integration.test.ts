import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConversation } from "../agent.js";
import type { LLMProvider } from "../providers/interface.js";
import { calendarCreateTool } from "../tools/calendar.js";
import { InMemoryToolRegistry } from "../tools/registry.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("calendar typed receipt integration", () => {
  it("persists fresh denial and never reaches the provider mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-calendar-receipt-"));
    roots.push(root);
    const requestApproval = vi.fn(async () => false);
    let call = 0;
    const provider: LLMProvider = {
      complete: async () => call++ === 0 ? {
        text: "",
        finishReason: "tool_calls",
        toolCalls: [{
          id: "calendar-call",
          name: "calendar_create",
          arguments: {
            summary: "Private meeting",
            start: "2026-08-03T09:00:00Z",
            end: "2026-08-03T09:30:00Z",
          },
        }],
      } : { text: "The calendar change was denied.", toolCalls: [], finishReason: "stop" },
      modelId: () => "fixture",
      contextWindow: () => 32_000,
    };
    const registry = new InMemoryToolRegistry();
    registry.register(calendarCreateTool);

    const outcome = await createConversation("system", {
      root,
      sessionId: "calendar-session",
      usageAgent: "cli",
      provider,
      registry,
      safety: { assess: async () => ({ risk: "allow", needsHuman: false, reason: "fixture" }), logEvent: async () => {} } as never,
      requestApproval,
    }).send("Create my meeting");

    expect(outcome.completionState).toBe("stopped");
    expect(requestApproval).toHaveBeenCalledWith(
      "create a calendar event",
      "adds an event to your calendar",
      undefined,
      { fresh: true },
    );
    const approvals = (await readFile(join(root, ".vanta", "approvals.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(approvals.map((entry) => entry.state)).toEqual(["requested", "denied"]);
    const receipts = (await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "calendar_create", disposition: "denied" }),
      expect.objectContaining({ action: "cli.turn", disposition: "none" }),
    ]));
    expect(JSON.stringify({ approvals, receipts })).not.toContain("Private meeting");
  });
});
