import { describe, it, expect, vi } from "vitest";
import { browserActTool } from "./browser-act.js";
import type { ToolContext } from "./types.js";

// Arg validation + the risky/unlisted-domain approval gate all run before any
// playwright import or browser launch, so a stub ctx is sufficient — no
// network/browser is touched in these cases.
function makeCtx(approve: boolean): ToolContext {
  return {
    root: "/tmp",
    safety: {} as ToolContext["safety"],
    requestApproval: vi.fn(async () => approve),
  };
}

describe("browserActTool argument validation", () => {
  it("rejects a missing actions array", async () => {
    const result = await browserActTool.execute({}, makeCtx(false));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('needs an "actions" array');
  });

  it("rejects an unknown action type", async () => {
    const result = await browserActTool.execute(
      { actions: [{ type: "drag" }] },
      makeCtx(false),
    );
    expect(result.ok).toBe(false);
  });
});

describe("browserActTool safety gate", () => {
  it("asks before an irreversible click and skips launch when denied", async () => {
    const ctx = makeCtx(false);
    const result = await browserActTool.execute(
      { actions: [{ type: "click", text: "Delete account" }] },
      ctx,
    );

    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    const [prompt, reason] =
      (ctx.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(prompt).toContain("⚠");
    expect(reason).toContain("irreversible");
    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied by user");
  });

  it("asks before navigating to an unlisted domain", async () => {
    const prev = process.env.VANTA_ALLOWED_DOMAINS;
    process.env.VANTA_ALLOWED_DOMAINS = "";
    try {
      const ctx = makeCtx(false);
      const result = await browserActTool.execute(
        { actions: [{ type: "navigate", url: "https://example.com" }] },
        ctx,
      );
      expect(ctx.requestApproval).toHaveBeenCalledOnce();
      expect(result.output).toBe("denied by user");
    } finally {
      if (prev === undefined) delete process.env.VANTA_ALLOWED_DOMAINS;
      else process.env.VANTA_ALLOWED_DOMAINS = prev;
    }
  });

  it("does not ask for a sequence of only safe actions", async () => {
    const prev = process.env.VANTA_ALLOWED_DOMAINS;
    // Allowlist the domain so navigate is pre-approved; remaining steps are safe.
    process.env.VANTA_ALLOWED_DOMAINS = "example.com";
    try {
      const ctx = makeCtx(true);
      // playwright-core may be absent in CI — either it runs (ok) or returns the
      // install hint. Either way the approval gate must NOT have fired.
      await browserActTool.execute(
        {
          actions: [
            { type: "navigate", url: "https://example.com" },
            { type: "scroll" },
            { type: "click", text: "Read more" },
          ],
        },
        ctx,
      );
      expect(ctx.requestApproval).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.VANTA_ALLOWED_DOMAINS;
      else process.env.VANTA_ALLOWED_DOMAINS = prev;
    }
  }, 45_000);
});

describe("browserActTool describeForSafety", () => {
  it("summarizes the action count benignly (kernel allows; tool owns approval)", () => {
    const desc = browserActTool.describeForSafety?.({
      actions: [{ type: "navigate", url: "https://x.test" }, { type: "scroll" }],
    });
    expect(desc).toBe("drive browser: 2 action(s)");
  });
});

describe("browserActTool kill-switch (VANTA_BROWSER_DISABLED)", () => {
  it("short-circuits before requestApproval when the flag is set", async () => {
    const prev = process.env.VANTA_BROWSER_DISABLED;
    process.env.VANTA_BROWSER_DISABLED = "1";
    try {
      const ctx = makeCtx(true);
      const result = await browserActTool.execute(
        { actions: [{ type: "navigate", url: "https://example.com" }] },
        ctx,
      );
      // Must not reach the approval gate
      expect(ctx.requestApproval).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      expect(result.output).toContain("VANTA_BROWSER_DISABLED");
    } finally {
      if (prev === undefined) delete process.env.VANTA_BROWSER_DISABLED;
      else process.env.VANTA_BROWSER_DISABLED = prev;
    }
  });
});
