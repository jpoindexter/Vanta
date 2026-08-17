import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  driveReadTool,
  driveCreateTool,
  driveUpdateTool,
  buildMultipartBody,
} from "./drive.js";
import type { ToolContext } from "./types.js";

const googleFetch = vi.hoisted(() => vi.fn());
vi.mock("../google/client.js", () => ({
  googleFetch,
  buildUrl: (base: string, params: Record<string, unknown>) => `${base}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)] as [string, string])).toString()}`,
}));

beforeEach(() => googleFetch.mockReset());

/**
 * A ctx whose requestApproval always denies. The kernel/safety client is never
 * touched on the deny path, so a bare cast is enough for these offline tests.
 */
const denyCtx = {
  root: "/tmp/vanta-test",
  sessionId: "drive-test",
  effectCallId: "drive-call-1",
  requestApproval: async () => false,
} as unknown as ToolContext;

const allowCtx = { ...denyCtx, requestApproval: async () => true } as ToolContext;

describe("describeForSafety constants", () => {
  it("returns benign constants with no content leakage", () => {
    expect(driveReadTool.describeForSafety?.({})).toBe("read a drive file");
    expect(driveCreateTool.describeForSafety?.({})).toBe("create a drive file");
    expect(driveUpdateTool.describeForSafety?.({})).toBe("update a drive file");
  });
});

describe("arg validation", () => {
  it("drive_read rejects missing id", async () => {
    const r = await driveReadTool.execute({}, denyCtx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("id");
  });

  it("drive_create rejects missing fields", async () => {
    const r = await driveCreateTool.execute({ name: "only" }, denyCtx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("content");
  });

  it("drive_update rejects missing fields", async () => {
    const r = await driveUpdateTool.execute({ id: "x" }, denyCtx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("content");
  });
});

describe("approval gating (deny path, no network)", () => {
  it("drive_create returns denied by user", async () => {
    const r = await driveCreateTool.execute(
      { name: "notes.txt", content: "hello" },
      denyCtx,
    );
    expect(r).toEqual({ ok: false, output: "denied by user" });
  });

  it("drive_update returns denied by user", async () => {
    const r = await driveUpdateTool.execute(
      { id: "abc123", version: "7", content: "hello" },
      denyCtx,
    );
    expect(r).toEqual({ ok: false, output: "denied by user" });
  });
});

describe("Drive transaction integrity", () => {
  it("creates with a provider-generated id and verifies exact content by readback", async () => {
    googleFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ ids: ["drive-id-1"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "drive-id-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("hello", { status: 200 }));
    const result = await driveCreateTool.execute({ name: "notes.txt", content: "hello" }, allowCtx);

    expect(result).toMatchObject({ ok: true, verification: { status: "verified" } });
    expect(googleFetch.mock.calls[0]?.[0]).toContain("generateIds");
    expect(String(googleFetch.mock.calls[1]?.[1]?.body)).toContain('"id":"drive-id-1"');
    expect(googleFetch.mock.calls[2]?.[0]).toContain("drive-id-1");
  });

  it("deletes the reserved file when the create acknowledgement id mismatches", async () => {
    googleFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ ids: ["drive-id-1"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "wrong-id" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("hello", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await driveCreateTool.execute({ name: "notes.txt", content: "hello" }, allowCtx);

    expect(result).toMatchObject({ ok: false, effectDisposition: "compensated" });
    expect(googleFetch.mock.calls[3]?.[0]).toContain("drive-id-1");
    expect(googleFetch.mock.calls[3]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("requires a Drive v3 version precondition before updating content", async () => {
    googleFetch.mockReset();
    const result = await driveUpdateTool.execute({ id: "abc123", content: "hello" }, allowCtx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("version");
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("blocks a stale version before reading or changing file content", async () => {
    googleFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc123", version: "8" }), { status: 200 }));
    const result = await driveUpdateTool.execute({ id: "abc123", version: "7", content: "hello" }, allowCtx);

    expect(result).toMatchObject({ ok: false, effectDisposition: "none" });
    expect(result.output).toContain("version precondition failed");
    expect(googleFetch).toHaveBeenCalledTimes(1);
  });

  it("checks the version around the original-byte read and accepts a monotonic readback newer than the acknowledgement", async () => {
    googleFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc123", version: "7" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("old", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc123", version: "7" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc123", version: "8" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("hello", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc123", version: "9" }), { status: 200 }));
    const result = await driveUpdateTool.execute({ id: "abc123", version: "7", content: "hello" }, allowCtx);

    expect(result).toMatchObject({ ok: true, verification: { status: "verified" } });
    expect(googleFetch.mock.calls[3]?.[1]).toMatchObject({ method: "PATCH", headers: { "Content-Type": "text/plain" } });
    expect(googleFetch.mock.calls[3]?.[0]).toContain("fields=id%2Cversion");
  });
});

describe("buildMultipartBody", () => {
  it("produces a well-formed multipart/related body", () => {
    const { body, contentType } = buildMultipartBody(
      { name: "notes.txt" },
      "hello world",
      "text/plain",
    );
    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    const boundary = contentType.split("boundary=")[1];
    expect(body.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(body.endsWith(`--${boundary}--`)).toBe(true);
    expect(body).toContain("Content-Type: application/json; charset=UTF-8");
    expect(body).toContain('{"name":"notes.txt"}');
    expect(body).toContain("Content-Type: text/plain");
    expect(body).toContain("hello world");
    // exactly two parts → opening boundary appears twice, closing once
    const opens = body.split(`--${boundary}\r\n`).length - 1;
    expect(opens).toBe(2);
  });
});
