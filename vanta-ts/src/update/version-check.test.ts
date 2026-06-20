import { describe, it, expect } from "vitest";
import {
  compareSemver,
  isUpdateAvailable,
  buildUpdateNotice,
  checkForUpdate,
} from "./version-check.js";

describe("compareSemver", () => {
  it("returns -1 when a is an older patch", () => {
    expect(compareSemver("1.2.3", "1.2.4")).toBe(-1);
  });

  it("returns 0 when equal", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns 1 when a is newer (numeric, not lexical: 1.10.0 > 1.9.0)", () => {
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
  });

  it("orders by major first", () => {
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
    expect(compareSemver("1.99.99", "2.0.0")).toBe(-1);
  });

  it("strips a leading v", () => {
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
  });

  it("strips a pre-release suffix (simple compare)", () => {
    expect(compareSemver("1.2.3-rc.1", "1.2.3")).toBe(0);
    expect(compareSemver("1.2.3-beta", "1.2.4")).toBe(-1);
  });

  it("treats malformed segments as 0 (safe, total)", () => {
    expect(compareSemver("abc", "0.0.0")).toBe(0);
    expect(compareSemver("1.x.3", "1.0.3")).toBe(0);
    expect(compareSemver("", "0.0.1")).toBe(-1);
  });
});

describe("isUpdateAvailable", () => {
  it("is true only when latest is strictly newer", () => {
    expect(isUpdateAvailable("0.2.0", "0.2.1")).toBe(true);
    expect(isUpdateAvailable("0.2.0", "0.2.0")).toBe(false);
    expect(isUpdateAvailable("0.3.0", "0.2.0")).toBe(false);
  });
});

describe("buildUpdateNotice", () => {
  it("is a single line naming both versions and the command", () => {
    const notice = buildUpdateNotice("0.2.0", "0.3.0");
    expect(notice).not.toContain("\n");
    expect(notice).toContain("0.2.0");
    expect(notice).toContain("0.3.0");
    expect(notice).toContain("vanta update");
  });
});

describe("checkForUpdate", () => {
  it("surfaces an update with a notice when latest is newer", async () => {
    const res = await checkForUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => "0.3.0",
    });
    expect(res.available).toBe(true);
    expect(res.latest).toBe("0.3.0");
    expect(res.notice).toContain("0.3.0");
  });

  it("reports no update when current is equal", async () => {
    const res = await checkForUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => "0.2.0",
    });
    expect(res.available).toBe(false);
    expect(res.latest).toBe("0.2.0");
    expect(res.notice).toBeUndefined();
  });

  it("reports no update when current is newer than latest", async () => {
    const res = await checkForUpdate({
      currentVersion: "0.4.0",
      fetchLatest: async () => "0.3.0",
    });
    expect(res.available).toBe(false);
    expect(res.notice).toBeUndefined();
  });

  it("degrades silently to no-update on a fetch throw (no false positive)", async () => {
    const res = await checkForUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => {
        throw new Error("network down");
      },
    });
    expect(res.available).toBe(false);
    expect(res.latest).toBeUndefined();
    expect(res.notice).toBeUndefined();
  });

  it("degrades to no-update when latest is unknown (null)", async () => {
    const res = await checkForUpdate({
      currentVersion: "0.2.0",
      fetchLatest: async () => null,
    });
    expect(res.available).toBe(false);
  });
});
