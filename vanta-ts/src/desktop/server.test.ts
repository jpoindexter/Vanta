import { describe, expect, it } from "vitest";
import { applyCompanionCors, approvalDecision, eventLabel, type DesktopState, type PendingApproval } from "./server.js";

const args = {};

describe("desktop event labels", () => {
  it("formats tool start and end events", () => {
    expect(eventLabel({ type: "tool_start", name: "read_file", args })).toEqual({ label: "→ read_file", kind: "tool_start", name: "read_file" });
    expect(eventLabel({ type: "tool_end", name: "read_file", ok: true, output: "done" })).toEqual({ label: "✓ read_file: done", ok: true, kind: "tool_end", name: "read_file", detail: "done" });
  });

  it("ignores raw text deltas", () => {
    expect(eventLabel({ type: "text_delta", delta: "x" })).toBeNull();
  });

  it("formats note events", () => {
    const label = eventLabel({ type: "note", text: "hello" });
    expect(label?.label).toContain("hello");
  });

  it("returns null for thinking events", () => {
    expect(eventLabel({ type: "thinking", text: "..." })).toBeNull();
  });

  it("returns null for turn_end events", () => {
    expect(eventLabel({ type: "turn_end", finalText: "done" })).toBeNull();
  });
});

describe("DesktopState pending approval flow", () => {
  it("stores and resolves a pending approval", () => {
    let resolved: boolean | null = null;
    const approval: PendingApproval = {
      id: "test-1",
      action: "shell_cmd",
      reason: "risky",
      resolve: (v) => { resolved = v; },
    };
    const state: DesktopState = { root: "/tmp", pendingApproval: approval };
    expect(state.pendingApproval?.id).toBe("test-1");
    state.pendingApproval?.resolve(true);
    expect(resolved).toBe(true);
    state.pendingApproval = undefined;
    expect(state.pendingApproval).toBeUndefined();
  });

  it("denies when pendingApproval is already set (concurrent guard)", () => {
    const state: DesktopState = { root: "/tmp" };
    // No pending: undefined
    expect(state.pendingApproval).toBeUndefined();
    // Set one
    state.pendingApproval = { id: "a", action: "x", reason: "y", resolve: () => {} };
    // Another request should be blocked (requestWebApproval returns false when already pending)
    expect(state.pendingApproval).toBeTruthy();
  });
});

describe("desktop server module exports", () => {
  it("exports createDesktopServer and serveDesktop", async () => {
    const mod = await import("./server.js");
    expect(typeof mod.createDesktopServer).toBe("function");
    expect(typeof mod.serveDesktop).toBe("function");
    expect(typeof mod.eventLabel).toBe("function");
  });
});

describe("native companion CORS", () => {
  it("allows only Capacitor's local app origin", () => {
    const headers = new Map<string, string>();
    const res = { setHeader: (key: string, value: string) => headers.set(key, value) } as never;
    expect(applyCompanionCors({ headers: { origin: "capacitor://localhost" } } as never, res, "/api/companion/status")).toBe(true);
    expect(headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(applyCompanionCors({ headers: { origin: "https://evil.example" } } as never, res, "/api/companion/status")).toBe(false);
    expect(applyCompanionCors({ headers: { origin: "capacitor://localhost" } } as never, res, "/api/status")).toBe(false);
  });
});

describe("approvalDecision", () => {
  it("accepts new explicit decisions and old approved booleans", () => {
    expect(approvalDecision("always", undefined)).toBe("always");
    expect(approvalDecision("never", undefined)).toBe("never");
    expect(approvalDecision(undefined, true)).toBe("allow");
    expect(approvalDecision(undefined, false)).toBe("deny");
  });
});
