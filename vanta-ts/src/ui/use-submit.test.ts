import { describe, it, expect, vi } from "vitest";
import { useSubmit, type SubmitDeps } from "./use-submit.js";
import type { SafetyClient } from "../safety-client.js";

// useSubmit calls no React hooks — it just builds the router closure — so it can
// be invoked directly in a unit test.

const allowSafety = { assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }) } as unknown as SafetyClient;

const waitUntil = async (cond: () => boolean, maxTicks = 100): Promise<void> => {
  for (let i = 0; i < maxTicks; i++) { if (cond()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!cond()) throw new Error("waitUntil: condition not met");
};

function harness(opts: boolean | Partial<SubmitDeps> = false): {
  onSubmit: (t: string) => void;
  runSlash: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  openOverlay: ReturnType<typeof vi.fn>;
  openGlobalSearch: ReturnType<typeof vi.fn>;
  detachBackgroundResponse: ReturnType<typeof vi.fn>;
} {
  const runSlash = vi.fn(), send = vi.fn(), dispatch = vi.fn(), openOverlay = vi.fn(), openGlobalSearch = vi.fn(), detachBackgroundResponse = vi.fn();
  const overrides = typeof opts === "boolean" ? { busy: opts } : opts;
  const deps: SubmitDeps = {
    runSlash, send, openOverlay, openGlobalSearch, busy: false, safety: allowSafety,
    repoRoot: process.cwd(), dispatch, detachBackgroundResponse, ...overrides,
  };
  return { onSubmit: useSubmit(deps), runSlash, send, dispatch, openOverlay, openGlobalSearch, detachBackgroundResponse };
}

describe("useSubmit routing", () => {
  it("routes a slash line with an arg to runSlash, not send", () => {
    const h = harness();
    h.onSubmit("/resume 123");
    expect(h.runSlash).toHaveBeenCalledWith("/resume 123");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("opens an overlay for a bare picker command instead of running it", () => {
    const h = harness();
    h.onSubmit("/model");
    expect(h.openOverlay).toHaveBeenCalledWith("model");
    expect(h.runSlash).not.toHaveBeenCalled();
  });

  it("runs (not overlay) when a picker command has an argument", () => {
    const h = harness();
    h.onSubmit("/model gemini");
    expect(h.runSlash).toHaveBeenCalledWith("/model gemini");
    expect(h.openOverlay).not.toHaveBeenCalled();
  });

  it("opens help on a bare ?", () => {
    const h = harness();
    h.onSubmit("?");
    expect(h.openOverlay).toHaveBeenCalledWith("help");
  });

  it("opens global session search on /searchall", () => {
    const h = harness();
    h.onSubmit("/searchall");
    expect(h.openGlobalSearch).toHaveBeenCalledTimes(1);
    expect(h.runSlash).not.toHaveBeenCalled();
  });

  it("sends plain text (no @refs) straight through", async () => {
    const h = harness();
    h.onSubmit("just a message");
    await waitUntil(() => h.send.mock.calls.length > 0);
    expect(h.send).toHaveBeenCalledWith("just a message");
  });

  it("queues instead of sending while busy", async () => {
    const h = harness(true);
    h.onSubmit("queued message");
    await waitUntil(() => h.dispatch.mock.calls.length > 0);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.dispatch).toHaveBeenCalledWith({ t: "enqueue", text: "queued message" });
  });

  it("detaches /bg instead of queueing it while a turn is visibly busy", () => {
    const h = harness(true);
    h.onSubmit("/bg");
    expect(h.detachBackgroundResponse).toHaveBeenCalledTimes(1);
    expect(h.runSlash).not.toHaveBeenCalled();
  });

  it("lets /bg attach when the foreground is idle", () => {
    const h = harness();
    h.onSubmit("/bg");
    expect(h.runSlash).toHaveBeenCalledWith("/bg");
    expect(h.detachBackgroundResponse).not.toHaveBeenCalled();
  });

  it("sends normal messages when the foreground is idle", async () => {
    const h = harness();
    h.onSubmit("next message");
    await waitUntil(() => h.send.mock.calls.length > 0);
    expect(h.send).toHaveBeenCalledWith("next message");
    expect(h.dispatch).not.toHaveBeenCalledWith({ t: "enqueue", text: "next message" });
  });

  it("intercepts a ! prefix before slash/send routing", () => {
    const h = harness();
    h.onSubmit("! true"); // harmless shell builtin, no output, no fs writes
    expect(h.runSlash).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});
