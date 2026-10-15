import { describe, expect, it } from "vitest";
import { runTaskIdentity } from "./task-host.js";

describe("runTaskIdentity", () => {
  it("labels an inbound gateway turn as messaging", () => {
    expect(runTaskIdentity()).toEqual({
      sessionId: "messaging",
      usageAgent: "messaging",
      usageTaskId: undefined,
    });
  });

  it("labels a scheduled wake as jobs and retains its goal id", () => {
    expect(runTaskIdentity({
      wake_reason: "cron:0 9 * * *",
      goal_id: "cron:42",
      since: null,
      delta: [],
    })).toEqual({
      sessionId: "jobs:cron:42",
      usageAgent: "jobs",
      usageTaskId: "cron:42",
    });
  });
});
