import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  gmailSearchTool,
  gmailReadTool,
  gmailDraftTool,
  gmailSendTool,
} from "./gmail.js";
import type { ToolContext } from "./types.js";

// A ctx whose requestApproval always denies. Filling the rest with throwing
// stubs proves the outbound tools touch nothing else on the deny path.
function denyCtx(): ToolContext {
  return {
    root: "/tmp/vanta-test",
    // safety isn't consulted by these tools directly (the loop does that).
    safety: undefined as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => false),
  };
}

// A network spy: if any tool reaches fetch on the deny path the test fails.
const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeForSafety constants leak no content", () => {
  it("returns benign constants regardless of args", () => {
    const sensitive = { query: "password reset", to: "ceo@corp.com", subject: "URGENT wire", body: "send money" };
    expect(gmailSearchTool.describeForSafety?.(sensitive)).toBe("search gmail");
    expect(gmailReadTool.describeForSafety?.(sensitive)).toBe("read a gmail message");
    expect(gmailDraftTool.describeForSafety?.(sensitive)).toBe("create a gmail draft");
    expect(gmailSendTool.describeForSafety?.(sensitive)).toBe("send an email");
    // No arg value bleeds into the safety string.
    for (const tool of [gmailSearchTool, gmailReadTool, gmailDraftTool, gmailSendTool]) {
      const s = tool.describeForSafety?.(sensitive) ?? "";
      expect(s).not.toContain("ceo@corp.com");
      expect(s).not.toContain("password");
      expect(s).not.toContain("money");
    }
  });
});

describe("invalid args -> ok:false, no network", () => {
  const ctx = denyCtx();

  it("gmail_search rejects empty query", async () => {
    const r = await gmailSearchTool.execute({ query: "" }, ctx);
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gmail_search rejects out-of-range max", async () => {
    const r = await gmailSearchTool.execute({ query: "hi", max: 99 }, ctx);
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gmail_read rejects missing id", async () => {
    const r = await gmailReadTool.execute({}, ctx);
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gmail_draft rejects missing fields", async () => {
    const r = await gmailDraftTool.execute({ to: "a@b.com" }, ctx);
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gmail_send rejects missing fields", async () => {
    const r = await gmailSendTool.execute({ subject: "x" }, ctx);
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("outbound tools are approval-gated before any network call", () => {
  it("gmail_draft returns denied by user without fetching", async () => {
    const ctx = denyCtx();
    const r = await gmailDraftTool.execute(
      { to: "a@b.com", subject: "hi", body: "yo" },
      ctx,
    );
    expect(r).toEqual({ ok: false, output: "denied by user" });
    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gmail_send returns denied by user without fetching", async () => {
    const ctx = denyCtx();
    const r = await gmailSendTool.execute(
      { to: "a@b.com", subject: "hi", body: "yo" },
      ctx,
    );
    expect(r).toEqual({ ok: false, output: "denied by user" });
    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("approval is requested with a constant action that leaks no recipient", async () => {
    const ctx = denyCtx();
    await gmailSendTool.execute(
      { to: "secret@target.com", subject: "wire $$$", body: "now" },
      ctx,
    );
    const call = (ctx.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("expected requestApproval to have been called");
    expect(call[0]).toBe("send an email");
    expect(call.join(" ")).not.toContain("secret@target.com");
    expect(call.join(" ")).not.toContain("wire");
  });
});
