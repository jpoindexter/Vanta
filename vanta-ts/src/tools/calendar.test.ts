import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import type { ToolContext } from "./types.js";
import {
  calendarReadTool,
  calendarCreateTool,
  calendarUpdateTool,
} from "./calendar.js";

const googleFetch = vi.hoisted(() => vi.fn());
vi.mock("../google/client.js", () => ({ googleFetch }));

beforeEach(() => googleFetch.mockReset());

// Calendar tools touch only requestApproval + googleFetch (network). These
// offline tests never reach the network: invalid args fail before the call,
// and the deny path returns before the fetch. root/safety are unused here.
function makeCtx(requestApproval: ToolContext["requestApproval"]): ToolContext {
  return {
    root: "/tmp",
    sessionId: "calendar-test",
    effectCallId: "calendar-call-1",
    safety: {} as SafetyClient,
    requestApproval,
  };
}

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
    const requestApproval = vi.fn(async () => false);
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      makeCtx(requestApproval),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied by user");
    expect(result.effectDisposition).toBe("denied");
    expect(requestApproval).toHaveBeenCalledWith(
      "create a calendar event",
      "adds an event to your calendar",
      undefined,
      { fresh: true },
    );
  });

  it("uses a stable provider id and verifies the created event by readback", async () => {
    let createdId = "";
    googleFetch
      .mockImplementationOnce(async (_url, init) => {
        createdId = JSON.parse(String(init?.body)).id;
        return new Response(JSON.stringify({ id: createdId, etag: '"create-etag"' }), { status: 200 });
      })
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        id: createdId,
        summary: "Standup",
        start: { dateTime: "2026-06-02T09:00:00Z" },
        end: { dateTime: "2026-06-02T09:30:00Z" },
      }), { status: 200 }));
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      makeCtx(async () => true),
    );

    expect(result).toMatchObject({ ok: true, verification: { status: "verified" } });
    const createBody = JSON.parse(String(googleFetch.mock.calls[0]?.[1]?.body));
    expect(createBody.id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleFetch.mock.calls[1]?.[0]).toContain(`/events/${createBody.id}`);
  });

  it("accepts provider-canonicalized timestamps that represent the approved instants", async () => {
    let createdId = "";
    googleFetch
      .mockImplementationOnce(async (_url, init) => {
        createdId = JSON.parse(String(init?.body)).id;
        return new Response(JSON.stringify({ id: createdId, etag: '"create-etag"' }), { status: 200 });
      })
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        id: createdId,
        summary: "Standup",
        start: { dateTime: "2026-06-02T09:00:00Z" },
        end: { dateTime: "2026-06-02T09:30:00Z" },
      }), { status: 200 }));

    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T10:00:00+01:00", end: "2026-06-02T10:30:00+01:00" },
      makeCtx(async () => true),
    );

    expect(result).toMatchObject({ ok: true, verification: { status: "verified" } });
    expect(googleFetch).toHaveBeenCalledTimes(2);
  });

  it("compensates a create whose provider readback does not match", async () => {
    let createdId = "";
    googleFetch
      .mockImplementationOnce(async (_url, init) => {
        createdId = JSON.parse(String(init?.body)).id;
        return new Response(JSON.stringify({ id: createdId, etag: '"create-etag"' }), { status: 200 });
      })
      .mockImplementationOnce(async () => new Response(JSON.stringify({ id: createdId, summary: "wrong" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      makeCtx(async () => true),
    );

    expect(result).toMatchObject({ ok: false, effectDisposition: "compensated" });
    expect(googleFetch.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE", headers: { "If-Match": '"create-etag"' } });
  });

  it("compensates a create whose acknowledgement names the wrong provider id", async () => {
    let createdId = "";
    googleFetch
      .mockImplementationOnce(async (_url, init) => {
        createdId = JSON.parse(String(init?.body)).id;
        return new Response(JSON.stringify({ id: "wrong-id" }), { status: 200 });
      })
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        id: createdId,
        etag: '"readback-etag"',
        summary: "Standup",
        start: { dateTime: "2026-06-02T09:00:00Z" },
        end: { dateTime: "2026-06-02T09:30:00Z" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      makeCtx(async () => true),
    );

    expect(result).toMatchObject({ ok: false, effectDisposition: "compensated" });
    expect(googleFetch.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE", headers: { "If-Match": '"readback-etag"' } });
  });

  it("uses the per-turn effect scope in one-shot provider ids", async () => {
    const ids: string[] = [];
    googleFetch.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const id = JSON.parse(String(init.body)).id;
        ids.push(id);
        return new Response(JSON.stringify({ id }), { status: 200 });
      }
      const id = String(_url).split("/").at(-1)!;
      return new Response(JSON.stringify({
        id,
        summary: "Standup",
        start: { dateTime: "2026-06-02T09:00:00Z" },
        end: { dateTime: "2026-06-02T09:30:00Z" },
      }), { status: 200 });
    });
    const base = makeCtx(async () => true);
    delete base.sessionId;
    await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      { ...base, effectScopeId: "turn-a" },
    );
    await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      { ...base, effectScopeId: "turn-b" },
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("calendar_update", () => {
  it("rejects a missing id before approval or network", async () => {
    const result = await calendarUpdateTool.execute({}, throwIfApprovedCtx);
    expect(result.ok).toBe(false);
  });

  it("returns 'denied by user' and makes no network call when denied", async () => {
    const requestApproval = vi.fn(async () => false);
    const result = await calendarUpdateTool.execute(
      { id: "evt_123", etag: '"current"', summary: "Renamed" },
      makeCtx(requestApproval),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied by user");
    expect(result.effectDisposition).toBe("denied");
    expect(requestApproval).toHaveBeenCalledWith(
      "update a calendar event",
      "modifies an event on your calendar",
      undefined,
      { fresh: true },
    );
  });

  it("requires an ETag precondition before approval or provider mutation", async () => {
    googleFetch.mockReset();
    const requestApproval = vi.fn(async () => true);
    const result = await calendarUpdateTool.execute(
      { id: "evt_123", summary: "Renamed" },
      makeCtx(requestApproval),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("etag");
    expect(requestApproval).not.toHaveBeenCalled();
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("binds If-Match, preserves the immutable id, and verifies update readback", async () => {
    googleFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "evt_123", summary: "Old", start: { dateTime: "2026-06-02T09:00:00Z" }, end: { dateTime: "2026-06-02T09:30:00Z" }, etag: '"old"',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "evt_123", etag: '"new"' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "evt_123", summary: "Renamed" }), { status: 200 }));
    const result = await calendarUpdateTool.execute(
      { id: "evt_123", etag: '"old"', summary: "Renamed" },
      makeCtx(async () => true),
    );

    expect(result).toMatchObject({ ok: true, verification: { status: "verified" } });
    expect(googleFetch.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH", headers: expect.objectContaining({ "If-Match": '"old"' }) });
  });
});

describe("calendar approval expiry", () => {
  it("keeps an expired decision separate from provider uncertainty", async () => {
    const expired = makeCtx(async () => { throw new Error("approval timed out"); });
    const result = await calendarCreateTool.execute(
      { summary: "Standup", start: "2026-06-02T09:00:00Z", end: "2026-06-02T09:30:00Z" },
      expired,
    );
    expect(result).toMatchObject({ ok: false, effectDisposition: "expired" });
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
