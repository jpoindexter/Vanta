import { describe, expect, it } from "vitest";
import { screenshotTool } from "./screenshot.js";
import type { ToolContext } from "./types.js";

// A context whose requestApproval would throw if invoked — these tests must
// short-circuit (on bad args or out-of-scope path) before approval or any
// browser launch is reached.
const ctx: ToolContext = {
  root: "/tmp/argo-scope",
  safety: {} as ToolContext["safety"],
  requestApproval: async () => {
    throw new Error("requestApproval must not be called in these tests");
  },
};

describe("screenshotTool", () => {
  it("returns ok:false when url is missing", async () => {
    const res = await screenshotTool.execute({ path: "out.png" }, ctx);
    expect(res.ok).toBe(false);
  });

  it("returns ok:false when url is not a valid URL", async () => {
    const res = await screenshotTool.execute(
      { url: "not-a-url", path: "out.png" },
      ctx,
    );
    expect(res.ok).toBe(false);
  });

  it("returns ok:false when path is missing", async () => {
    const res = await screenshotTool.execute(
      { url: "https://example.com" },
      ctx,
    );
    expect(res.ok).toBe(false);
  });

  it("returns ok:false for a path outside project scope", async () => {
    const res = await screenshotTool.execute(
      { url: "https://example.com", path: "../escape.png" },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("outside project scope");
  });

  describe("describeForSafety", () => {
    it("returns only the url (no page content)", () => {
      expect(screenshotTool.describeForSafety?.({ url: "https://x.com" })).toBe(
        "screenshot https://x.com",
      );
    });

    it("tolerates a missing url", () => {
      expect(screenshotTool.describeForSafety?.({})).toBe("screenshot ");
    });
  });
});
