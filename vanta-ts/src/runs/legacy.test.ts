import { describe, expect, it } from "vitest";
import type { Session } from "../sessions/store.js";
import { deriveLegacyRuns } from "./legacy.js";

describe("legacy run derivation", () => {
  it.each([false, true])("never calls a tool-request checkpoint done (tool answered: %s)", (answered) => {
    const session: Session = {
      id: "workflow-checkpoint", title: "Prepare a review",
      started: "2026-10-23T10:00:00.000Z", updated: "2026-10-23T10:01:00.000Z",
      messages: [
        { role: "user", content: "Prepare a review" },
        { role: "assistant", content: "I will prepare it.", toolCalls: [{ id: "wf-1", name: "compose_workflow", arguments: {} }] },
        ...(answered ? [{ role: "tool" as const, toolCallId: "wf-1", name: "compose_workflow", content: "paused" }] : []),
      ],
    };
    expect(deriveLegacyRuns(session, "/project")[0]?.status).toBe("interrupted");
  });

  it("keeps a completed receipt authoritative after tool calls", () => {
    const session: Session = {
      id: "finished-workflow", title: "Prepare a review",
      started: "2026-10-23T10:00:00.000Z", updated: "2026-10-23T10:01:00.000Z",
      messages: [
        { role: "user", content: "Prepare a review" },
        { role: "assistant", content: "A partial reply", desktopRun: { status: "failed", events: [], actions: [] } },
      ],
    };
    expect(deriveLegacyRuns(session, "/project")[0]?.status).toBe("failed");
  });

  it("marks a checkpointed user turn without an assistant response as interrupted", () => {
    const session: Session = {
      id: "restart-recovery",
      title: "Interrupted turn",
      started: "2026-07-24T10:00:00.000Z",
      updated: "2026-07-24T10:01:00.000Z",
      messages: [
        { role: "system", content: "You are Vanta." },
        { role: "user", content: "Inspect the roadmap" },
      ],
    };

    expect(deriveLegacyRuns(session, "/project")).toMatchObject([{
      status: "interrupted",
      provenance: "derived",
      finalOutput: "",
      events: [],
    }]);
  });
});
