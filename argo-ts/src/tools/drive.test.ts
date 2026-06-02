import { describe, it, expect } from "vitest";
import {
  driveReadTool,
  driveCreateTool,
  driveUpdateTool,
  buildMultipartBody,
} from "./drive.js";
import type { ToolContext } from "./types.js";

/**
 * A ctx whose requestApproval always denies. The kernel/safety client is never
 * touched on the deny path, so a bare cast is enough for these offline tests.
 */
const denyCtx = {
  root: "/tmp/argo-test",
  requestApproval: async () => false,
} as unknown as ToolContext;

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
      { id: "abc123", content: "hello" },
      denyCtx,
    );
    expect(r).toEqual({ ok: false, output: "denied by user" });
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
