import { afterEach, describe, expect, it, vi } from "vitest";
import { grantAlways, grantNever } from "./grant.js";
import { decidePermission } from "./decision.js";

vi.mock("./grant.js", () => ({ grantAlways: vi.fn(), grantNever: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("shared approval decision contract", () => {
  it.each(["allow", "always", "deny", "never"] as const)("decides %s without widening the tool scope", async (decision) => {
    expect(await decidePermission({ toolName: "shell_cmd" }, decision)).toEqual({ approved: decision === "allow" || decision === "always", decision });
    if (decision === "always") expect(grantAlways).toHaveBeenCalledExactlyOnceWith("shell_cmd");
    else expect(grantAlways).not.toHaveBeenCalled();
    if (decision === "never") expect(grantNever).toHaveBeenCalledExactlyOnceWith("shell_cmd");
    else expect(grantNever).not.toHaveBeenCalled();
  });

  it.each(["always", "never"] as const)("fails closed when %s cannot be persisted", async (decision) => {
    vi.mocked(decision === "always" ? grantAlways : grantNever).mockRejectedValueOnce(new Error("private path"));
    expect(await decidePermission({ toolName: "shell_cmd" }, decision)).toEqual({
      approved: false, decision: "deny", error: "Could not save the approval rule. The action was not approved.",
    });
  });

  it.each(["always", "never"] as const)("rejects %s without a tool", async (decision) => {
    expect(await decidePermission({}, decision)).toMatchObject({ approved: false, decision: "deny", error: "Cannot save an approval rule without a tool name." });
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });

  it("does not remember an allow for a fresh approval", async () => {
    expect(await decidePermission({ toolName: "payment_transaction", fresh: true }, "always")).toEqual({ approved: false, decision: "deny" });
    expect(grantAlways).not.toHaveBeenCalled();
    expect(await decidePermission({ toolName: "payment_transaction", fresh: true }, "allow")).toEqual({ approved: true, decision: "allow" });
  });
});
