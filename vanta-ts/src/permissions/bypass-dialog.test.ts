import { describe, it, expect } from "vitest";
import {
  BYPASS_CONFIRM_TOKEN,
  buildBypassWarning,
  isBypassConfirmed,
  resolveBypassActivation,
  bypassAutoApproves,
} from "./bypass-dialog.js";

describe("BYPASS_CONFIRM_TOKEN", () => {
  it("is a multi-word phrase, not a bare yes/y", () => {
    expect(BYPASS_CONFIRM_TOKEN.split(/\s+/).length).toBeGreaterThan(1);
    expect(BYPASS_CONFIRM_TOKEN).not.toBe("y");
    expect(BYPASS_CONFIRM_TOKEN).not.toBe("yes");
  });
});

describe("buildBypassWarning", () => {
  const warning = buildBypassWarning();

  it("names the danger and that it auto-approves the ask tier", () => {
    expect(warning.toLowerCase()).toContain("danger");
    expect(warning.toLowerCase()).toContain("auto-approve");
    expect(warning).toContain("`ask`");
  });

  it("reaffirms the kernel block floor still holds", () => {
    expect(warning.toLowerCase()).toContain("block");
    expect(warning.toLowerCase()).toContain("never");
  });

  it("tells the operator the exact confirm token", () => {
    expect(warning).toContain(BYPASS_CONFIRM_TOKEN);
  });
});

describe("isBypassConfirmed", () => {
  it("returns true for the exact token", () => {
    expect(isBypassConfirmed(BYPASS_CONFIRM_TOKEN)).toBe(true);
  });

  it("returns true case-insensitively and trimmed", () => {
    expect(isBypassConfirmed("ENABLE BYPASS")).toBe(true);
    expect(isBypassConfirmed("  Enable Bypass  ")).toBe(true);
    expect(isBypassConfirmed("\tenable bypass\n")).toBe(true);
  });

  it("returns false for a bare y/yes", () => {
    expect(isBypassConfirmed("y")).toBe(false);
    expect(isBypassConfirmed("yes")).toBe(false);
    expect(isBypassConfirmed("Y")).toBe(false);
  });

  it("returns false for empty / whitespace input", () => {
    expect(isBypassConfirmed("")).toBe(false);
    expect(isBypassConfirmed("   ")).toBe(false);
  });

  it("returns false for a near-miss", () => {
    expect(isBypassConfirmed("enable bypas")).toBe(false);
    expect(isBypassConfirmed("enablebypass")).toBe(false);
    expect(isBypassConfirmed("enable bypass mode")).toBe(false);
    expect(isBypassConfirmed("bypass")).toBe(false);
  });
});

describe("resolveBypassActivation", () => {
  it("activates only when requested AND confirmed", () => {
    expect(resolveBypassActivation(true, true)).toBe(true);
  });

  it("does NOT activate when requested but not confirmed", () => {
    expect(resolveBypassActivation(true, false)).toBe(false);
  });

  it("does NOT activate when confirmed but not requested", () => {
    expect(resolveBypassActivation(false, true)).toBe(false);
  });

  it("does NOT activate when neither", () => {
    expect(resolveBypassActivation(false, false)).toBe(false);
  });

  it("no confirmation → bypass stays off (default), even with a request", () => {
    const requested = true;
    const confirmed = isBypassConfirmed("y"); // a stray bare-yes does not confirm
    expect(resolveBypassActivation(requested, confirmed)).toBe(false);
  });
});

describe("bypassAutoApproves — the immovable block floor", () => {
  it("auto-approves the ask tier", () => {
    expect(bypassAutoApproves("ask")).toBe(true);
  });

  it("treats allow as already-approved", () => {
    expect(bypassAutoApproves("allow")).toBe(true);
  });

  it("NEVER auto-approves a kernel block — the security invariant", () => {
    expect(bypassAutoApproves("block")).toBe(false);
  });

  it("a confirmed, active bypass still cannot auto-approve a block", () => {
    // Even at the most-permissive resolved state, a Block is immovable.
    const active = resolveBypassActivation(true, isBypassConfirmed(BYPASS_CONFIRM_TOKEN));
    expect(active).toBe(true);
    expect(active && bypassAutoApproves("block")).toBe(false);
    expect(active && bypassAutoApproves("ask")).toBe(true);
  });
});
