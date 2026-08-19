import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserActTool } from "./browser-act.js";
import { runActions } from "./browser-act-run.js";
import { saveCookie } from "../reach/cookie.js";
import type { ToolContext } from "./types.js";

vi.mock("./browser-act-run.js", () => ({
  runActions: vi.fn(async () => ({ ok: true, output: "stubbed browser run" })),
}));

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

const originalVantaHome = process.env.VANTA_HOME;

afterEach(() => {
  vi.mocked(runActions).mockClear();
  if (originalVantaHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = originalVantaHome;
});

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
      // The browser runner is mocked because this test owns only the approval
      // boundary; browser launch and network behavior have separate coverage.
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

  it("asks before loading a stored browser session", async () => {
    const ctx = makeCtx(false);
    const result = await browserActTool.execute(
      {
        actions: [{ type: "navigate", url: "https://www.linkedin.com/feed/" }],
        sessionChannel: "linkedin",
      },
      ctx,
    );

    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    const [, reason] =
      (ctx.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(reason).toContain("stored login session: linkedin");
    expect(result).toEqual({ ok: false, output: "denied by user" });
    expect(runActions).not.toHaveBeenCalled();
  });

  it("fails closed before launch when the stored session is missing", async () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-browser-act-missing-"));
    process.env.VANTA_HOME = home;
    try {
      const result = await browserActTool.execute(
        {
          actions: [{ type: "navigate", url: "https://www.linkedin.com/feed/" }],
          sessionChannel: "linkedin",
        },
        makeCtx(true),
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("No stored session for linkedin");
      expect(runActions).not.toHaveBeenCalled();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("never discloses a stored session to an unrelated host", async () => {
    const ctx = makeCtx(true);
    const result = await browserActTool.execute(
      {
        actions: [{ type: "navigate", url: "https://example.com" }],
        sessionChannel: "linkedin",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("restricted to linkedin.com");
    expect(ctx.requestApproval).not.toHaveBeenCalled();
    expect(runActions).not.toHaveBeenCalled();
  });

  it("passes an approved stored session to the browser runner", async () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-browser-act-session-"));
    process.env.VANTA_HOME = home;
    try {
      expect(saveCookie("linkedin", "li_at=test-only-secret", process.env).ok).toBe(true);
      const result = await browserActTool.execute(
        {
          actions: [{ type: "navigate", url: "https://www.linkedin.com/feed/" }],
          sessionChannel: "linkedin",
        },
        makeCtx(true),
      );
      expect(result.ok).toBe(true);
      expect(runActions).toHaveBeenCalledOnce();
      expect(vi.mocked(runActions).mock.calls[0]?.[4]).toEqual({
        cookie: "li_at=test-only-secret",
        url: "https://www.linkedin.com/feed/",
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
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
