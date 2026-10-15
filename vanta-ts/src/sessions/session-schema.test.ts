import { describe, expect, it } from "vitest";
import { SessionSchema } from "./session-schema.js";
import type { DesktopRunFailureKind } from "../types.js";

describe("session receipt compatibility", () => {
  it("retains the existing provider authentication recovery disposition", () => {
    const failureKind: DesktopRunFailureKind = "provider_auth";
    const saved = SessionSchema.safeParse({
      id: "auth-recovery", title: "Authentication required",
      started: "2026-10-08T00:00:00.000Z", updated: "2026-10-08T00:00:00.000Z",
      messages: [{ role: "assistant", content: "Provider authentication required.",
        desktopRun: { status: "failed", failureKind, events: [],
          actions: ["edit_request", "start_from_checkpoint"] } }],
    });
    expect(saved.success).toBe(true);
    if (saved.success) expect(saved.data.messages[0]).toMatchObject({
      desktopRun: { failureKind: "provider_auth", actions: ["edit_request", "start_from_checkpoint"] },
    });
  });
});
