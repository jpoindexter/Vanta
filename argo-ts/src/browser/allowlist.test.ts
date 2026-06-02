import { describe, it, expect } from "vitest";
import { extractDomain, isAllowedDomain } from "./allowlist.js";

describe("extractDomain", () => {
  it("returns the lowercased hostname for a valid url", () => {
    expect(extractDomain("https://Example.COM/path?q=1")).toBe("example.com");
  });

  it("returns null for an invalid url", () => {
    expect(extractDomain("not a url")).toBeNull();
  });
});

describe("isAllowedDomain", () => {
  const env = { ARGO_ALLOWED_DOMAINS: "example.com, github.com" };

  it("allows an exact domain match", () => {
    expect(isAllowedDomain("https://example.com/page", env)).toBe(true);
  });

  it("allows a subdomain of a listed domain", () => {
    expect(isAllowedDomain("https://api.example.com/v1", env)).toBe(true);
  });

  it("rejects an unlisted domain", () => {
    expect(isAllowedDomain("https://evil.com/page", env)).toBe(false);
  });

  it("rejects a suffix that is not a subdomain boundary", () => {
    expect(isAllowedDomain("https://notexample.com/page", env)).toBe(false);
  });

  it("rejects everything when the env list is empty", () => {
    expect(isAllowedDomain("https://example.com", { ARGO_ALLOWED_DOMAINS: "" })).toBe(
      false,
    );
  });

  it("rejects everything when the env var is missing", () => {
    expect(isAllowedDomain("https://example.com", {})).toBe(false);
  });

  it("rejects an invalid url", () => {
    expect(isAllowedDomain("not a url", env)).toBe(false);
  });
});
