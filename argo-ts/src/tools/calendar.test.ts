import { describe, expect, it } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import type { ToolContext } from "./types.js";
import {
  calendarReadTool,
  calendarCreateTool,
  calendarUpdateTool,
} from "./calendar.js";

// Calendar tools touch only requestApproval + googleFetch (network). These
// offline tests never reach the network: invalid args fail before the call,
// and the deny path returns before the fetch. root/safety are unused here.
function makeCtx(requestApproval: ToolContext["requestApproval"]): ToolContext {
  return { root: "/tmp", safety: {} as SafetyClient, requestApproval };
}

const denyCtx = makeCtx(async () => false);
// Asserts the network is never touched: if execute reached googleFetch it would
// need a token; if it reached approval-then-fetch this throw would surface.
const throwIfApprovedCtx = makeCtx(async () => {
  throw new Error("approval must not be reached on invalid args");
});

describe("describeForSafety constants (never leak content)", () => {
  it("calendar_read describes a benign read", () => {
    expect(calendarReadTool.describeForSafety?.({})).toBe("read calendar events");
  });

  it("calendar_create describes the action without content", () => {
    expect(
      calendarCreateTool.describeForSafety?.({
        summary: "secret merger",
        start: "x",
        end: "y",
      }),
    ).toBe("create a calendar event");
  });

  it("calendar_update describes the action without content", () => {
    expect(
      calendarUpdateTool.describeForSafety?.({ id: "abc", summary: "leak" }),
    ).toBe("update a calendar event");
  });
});

describe("calendar_create", () => {
  it("rejects missing required args before approval or network", async () => {
    const result = await calendarCreateTool.execute({}, throwIfApprovedCtx);
    expect(result.ok).toBe(false);
  });

  it("returns 'denied by user' and makes no network call when denied", async () => {
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      denyCtx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied by user");
  });
});

describe("calendar_update", () => {
  it("rejects a missing id before approval or network", async () => {
    const result = await calendarUpdateTool.execute({}, throwIfApprovedCtx);
    expect(result.ok).toBe(false);
  });

  it("returns 'denied by user' and makes no network call when denied", async () => {
    const result = await calendarUpdateTool.execute(
      { id: "evt_123", summary: "Renamed" },
      denyCtx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied by user");
  });
});

describe("calendar_read", () => {
  it("rejects an out-of-range max before any network call", async () => {
    // requestApproval throws if invoked; read never calls it, so reaching the
    // network would be the only other failure — args rejection prevents that.
    const result = await calendarReadTool.execute({ max: 99 }, throwIfApprovedCtx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("1-25");
  });
});
