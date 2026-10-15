import { describe, expect, it } from "vitest";
import type { Session } from "../sessions/store.js";
import { deriveLegacyRuns } from "./legacy.js";

describe("legacy run derivation", () => {
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
