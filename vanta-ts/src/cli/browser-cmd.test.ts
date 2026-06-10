import { describe, it, expect } from "vitest";
import { siteToUrl } from "./browser-cmd.js";

// Only the pure site→URL resolver is unit-tested. The headed auth flow needs a
// real Chromium + a human login and is verified live (see report).

describe("siteToUrl", () => {
  it("prepends https:// to a bare host", () => {
    expect(siteToUrl("github.com")).toBe("https://github.com/");
  });

  it("keeps an explicit https scheme", () => {
    expect(siteToUrl("https://github.com/login")).toBe("https://github.com/login");
  });

  it("keeps an explicit http scheme", () => {
    expect(siteToUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("trims surrounding whitespace", () => {
    expect(siteToUrl("  x.com  ")).toBe("https://x.com/");
  });

  it("returns null for an empty string", () => {
    expect(siteToUrl("")).toBeNull();
    expect(siteToUrl("   ")).toBeNull();
  });

  it("returns null for an unparseable site", () => {
    expect(siteToUrl("http://")).toBeNull();
  });
});
