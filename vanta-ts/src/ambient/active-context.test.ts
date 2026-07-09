import { describe, expect, it } from "vitest";
import { collectActiveContext, parseMacFrontmost } from "./active-context.js";

describe("active context", () => {
  it("parses macOS frontmost app and window title", () => {
    const ctx = parseMacFrontmost("Cursor\nambient-screen-cmd.ts - vanta-ts\n", "/repo");
    expect(ctx).toMatchObject({
      source: "macos-frontmost",
      app: "Cursor",
      window: "ambient-screen-cmd.ts - vanta-ts",
      cwd: "/repo",
    });
    expect(ctx.context).toContain("active app: Cursor");
    expect(ctx.context).toContain("active window: ambient-screen-cmd.ts");
  });

  it("falls back to cwd-only off macOS", async () => {
    const ctx = await collectActiveContext({ platform: "linux", cwd: () => "/repo" });
    expect(ctx.source).toBe("cwd-only");
    expect(ctx.context).toContain("repo: /repo");
  });

  it("falls back to cwd-only when osascript fails", async () => {
    const ctx = await collectActiveContext({
      platform: "darwin",
      cwd: () => "/repo",
      execFile: async () => {
        throw new Error("not allowed");
      },
    });
    expect(ctx.source).toBe("cwd-only");
    expect(ctx.error).toContain("not allowed");
  });
});
