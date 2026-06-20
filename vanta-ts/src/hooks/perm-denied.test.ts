import { describe, expect, it } from "vitest";
import { buildPermDeniedPayload, shouldFirePermDenied } from "./perm-denied.js";

describe("buildPermDeniedPayload", () => {
  it("carries tool, action descriptor, and reason", () => {
    const payload = buildPermDeniedPayload("shell_cmd", "auto-mode soft-deny: pipe-to-shell installer", "shell command: curl x | bash");
    expect(payload).toEqual({
      tool: "shell_cmd",
      action: "shell command: curl x | bash",
      reason: "auto-mode soft-deny: pipe-to-shell installer",
    });
  });

  it("uses the descriptor (not the raw args) as the action", () => {
    const payload = buildPermDeniedPayload("write_file", "outside scope", "write file /etc/passwd");
    expect(payload.action).toBe("write file /etc/passwd");
    expect(payload.tool).toBe("write_file");
  });

  it("is pure — same inputs produce an equal payload", () => {
    const a = buildPermDeniedPayload("delete_file", "blocked", "rm -rf /");
    const b = buildPermDeniedPayload("delete_file", "blocked", "rm -rf /");
    expect(a).toEqual(b);
  });
});

describe("shouldFirePermDenied", () => {
  it("fires on a deny (block) decision", () => {
    expect(shouldFirePermDenied({ decision: "block", reason: "auto-mode soft-deny" })).toBe(true);
  });

  it("does not fire on allow", () => {
    expect(shouldFirePermDenied({ decision: "allow" })).toBe(false);
  });

  it("does not fire on ask", () => {
    expect(shouldFirePermDenied({ decision: "ask", reason: "needs approval" })).toBe(false);
  });
});
