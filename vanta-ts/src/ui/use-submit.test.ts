import { describe, it, expect, vi } from "vitest";
import { useSubmit, type SubmitDeps } from "./use-submit.js";
import type { SafetyClient } from "../safety-client.js";

// useSubmit calls no React hooks — it just builds the router closure — so it can
// be invoked directly in a unit test.

const allowSafety = { assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }) } as unknown as SafetyClient;

function harness(busy = false): { onSubmit: (t: string) => void; runSlash: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; dispatch: ReturnType<typeof vi.fn> } {
  const runSlash = vi.fn(), send = vi.fn(), dispatch = vi.fn();
  const deps: SubmitDeps = { runSlash, send, busy, safety: allowSafety, repoRoot: process.cwd(), dispatch };
  return { onSubmit: useSubmit(deps), runSlash, send, dispatch };
}

describe("useSubmit routing", () => {
  it("routes a slash line to runSlash, not send", () => {
    const h = harness();
    h.onSubmit("/help");
    expect(h.runSlash).toHaveBeenCalledWith("/help");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("sends plain text (no @refs) straight through", async () => {
    const h = harness();
    h.onSubmit("just a message");
    await new Promise((r) => setTimeout(r, 10));
    expect(h.send).toHaveBeenCalledWith("just a message");
  });

  it("notes instead of sending while busy", () => {
    const h = harness(true);
    h.onSubmit("queued message");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.dispatch).toHaveBeenCalledWith({ t: "note", text: expect.stringContaining("still working") });
  });

  it("intercepts a ! prefix before slash/send routing", () => {
    const h = harness();
    h.onSubmit("! true"); // harmless shell builtin, no output, no fs writes
    expect(h.runSlash).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});
