import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConversation } from "../agent.js";
import { listTickets } from "../tickets/store.js";
import { listWorkTurns } from "../maintenance/budget.js";
import type { LLMProvider } from "../providers/interface.js";

describe("agent needs-human integration", () => {
  it("does not queue a blocker from model prose in a completed conversation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-agent-human-"));
    const provider: LLMProvider = {
      complete: async () => ({
        text: "The calendar adapter is not configured; human setup is required.",
        toolCalls: [],
        finishReason: "stop",
      }),
      modelId: () => "fixture",
      contextWindow: () => 32_000,
    };
    const convo = createConversation("system", {
      root,
      sessionId: "session-queue-proof",
      provider,
      safety: {} as never,
      registry: { schemas: () => [], get: () => undefined } as never,
      requestApproval: async () => false,
    });

    const outcome = await convo.send("Schedule the launch review");
    expect(outcome.stoppedReason).toBe("done");
    const tickets = await listTickets(join(root, ".vanta"));
    expect(tickets).toHaveLength(0);
    const work = await listWorkTurns(join(root, ".vanta"));
    expect(work).toHaveLength(1);
    expect(work[0]?.workClass).toBe("delivery");
  });
});
