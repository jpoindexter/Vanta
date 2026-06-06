import { describe, it, expect, vi } from "vitest";
import { browserNavigateTool } from "./browser-navigate.js";
import type { ToolContext } from "./types.js";

// Arg validation and the allowlist/approval gate all run before any
// playwright import or browser launch, so a stub ctx is sufficient and no
// network/browser is touched.
function makeCtx(approve: boolean): ToolContext {
  return {
    root: "/tmp",
    safety: {} as ToolContext["safety"],
    requestApproval: vi.fn(async () => approve),
  };
}

describe("browserNavigateTool argument validation", () => {
  it("returns an actionable error when url is missing", async () => {
    const result = await browserNavigateTool.execute({}, makeCtx(false));

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'browser_navigate needs a valid "url" and optional "actions"',
    );
  });

  it("rejects a non-url string", async () => {
    const result = await browserNavigateTool.execute(
      { url: "not a url" },
      makeCtx(false),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'browser_navigate needs a valid "url" and optional "actions"',
    );
  });

  it("rejects a malformed action (unknown type)", async () => {
    const result = await browserNavigateTool.execute(
      { url: "https://example.com", actions: [{ type: "hover" }] },
      makeCtx(false),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'browser_navigate needs a valid "url" and optional "actions"',
    );
  });

  it("rejects an action whose selector is the wrong type", async () => {
    const result = await browserNavigateTool.execute(
      { url: "https://example.com", actions: [{ type: "click", selector: 42 }] },
      makeCtx(false),
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      'browser_navigate needs a valid "url" and optional "actions"',
    );
  });
});

describe("browserNavigateTool safety gate", () => {
  it("denies and skips launch when the domain is disallowed and the user declines", async () => {
    // Empty allowlist => domain not pre-approved => approval requested.
    const prev = process.env.VANTA_ALLOWED_DOMAINS;
    process.env.VANTA_ALLOWED_DOMAINS = "";
    try {
      const ctx = makeCtx(false);
      const result = await browserNavigateTool.execute(
        { url: "https://example.com" },
        ctx,
      );

      expect(ctx.requestApproval).toHaveBeenCalledOnce();
      expect(result.ok).toBe(false);
      expect(result.output).toBe("denied by user");
    } finally {
      if (prev === undefined) delete process.env.VANTA_ALLOWED_DOMAINS;
      else process.env.VANTA_ALLOWED_DOMAINS = prev;
    }
  });
});

describe("browserNavigateTool describeForSafety", () => {
  it("returns only the url", () => {
    const description = browserNavigateTool.describeForSafety?.({
      url: "https://example.com/page",
      actions: [{ type: "click", selector: "#go" }],
    });

    expect(description).toBe("navigate https://example.com/page");
  });

  it("tolerates a missing url", () => {
    expect(browserNavigateTool.describeForSafety?.({})).toBe("navigate ");
  });
});
