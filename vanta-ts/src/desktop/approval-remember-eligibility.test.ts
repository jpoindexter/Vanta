import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalPayload, requestWebApproval, resolveApproval, type PendingApproval } from "./approval.js";
import { grantAlways, grantNever } from "../permissions/grant.js";

vi.mock("../permissions/grant.js", () => ({ grantAlways: vi.fn(), grantNever: vi.fn() }));

const pendingRequest = (detail?: PendingApproval["detail"]): PendingApproval => ({
  id: "isolated-test", action: "edit file src/example.ts", reason: "file change",
  toolName: "edit_file", detail, resolve: vi.fn(),
});

beforeEach(() => { vi.clearAllMocks(); });

describe("Desktop each-time approval eligibility", () => {
  it("forwards policy eligibility from the host request into the renderer payload", async () => {
    const host: { pendingApproval?: PendingApproval } = {};
    const result = requestWebApproval(host, "edit file src/example.ts", "Approval required every time", {
      toolName: "edit_file", detail: { canRemember: false },
    });
    expect(host.pendingApproval?.detail?.canRemember).toBe(false);
    expect(approvalPayload(host.pendingApproval!)).toMatchObject({ request: { canRemember: false } });
    await resolveApproval(host.pendingApproval!, "deny");
    await expect(result).resolves.toBe(false);
  });

  it.each(["always", "never"] as const)("rejects forged %s without saving or resolving", async (decision) => {
    const pending = pendingRequest({ canRemember: false });
    await expect(resolveApproval(pending, decision)).rejects.toThrow("requires a one-time decision");
    expect(pending.resolve).not.toHaveBeenCalled();
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });

  it.each([["allow", true], ["deny", false]] as const)("retains one-time %s", async (decision, approved) => {
    const pending = pendingRequest({ canRemember: false });
    await resolveApproval(pending, decision);
    expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(approved);
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });

  it("still saves an eligible ordinary tool before approving", async () => {
    const pending = pendingRequest();
    await resolveApproval(pending, "always");
    expect(grantAlways).toHaveBeenCalledExactlyOnceWith("edit_file");
    expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(true);
    expect(vi.mocked(grantAlways).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(pending.resolve).mock.invocationCallOrder[0]!);
  });

  it.each(["always", "never"] as const)("retains the fresh %s guard", async (decision) => {
    const pending = pendingRequest({ fresh: true });
    await expect(resolveApproval(pending, decision)).rejects.toThrow("requires one-time approval");
    expect(pending.resolve).not.toHaveBeenCalled();
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });
});
