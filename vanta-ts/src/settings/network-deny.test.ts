import { describe, it, expect } from "vitest";
import { isDomainDenied, networkDecision } from "./network-deny.js";

describe("isDomainDenied — pure exact + subdomain match", () => {
  it("denies the exact domain", () => {
    expect(isDomainDenied("evil.com", ["evil.com"])).toBe(true);
  });

  it("denies a subdomain of a denied domain", () => {
    expect(isDomainDenied("api.evil.com", ["evil.com"])).toBe(true);
    expect(isDomainDenied("a.b.evil.com", ["evil.com"])).toBe(true);
  });

  it("allows an unrelated domain", () => {
    expect(isDomainDenied("good.com", ["evil.com"])).toBe(false);
  });

  it("does NOT match a suffix that isn't a domain boundary", () => {
    // notevil.com ends with "evil.com" textually but is not a subdomain of it.
    expect(isDomainDenied("notevil.com", ["evil.com"])).toBe(false);
  });

  it("is case-insensitive and tolerates trailing dots / whitespace", () => {
    expect(isDomainDenied("API.Evil.COM", ["evil.com"])).toBe(true);
    expect(isDomainDenied("evil.com.", [" Evil.com "])).toBe(true);
  });

  it("empty deny list never denies", () => {
    expect(isDomainDenied("evil.com", [])).toBe(false);
  });

  it("ignores empty/whitespace deny entries (no accidental match-all)", () => {
    expect(isDomainDenied("good.com", ["", "   "])).toBe(false);
  });

  it("empty host never matches", () => {
    expect(isDomainDenied("", ["evil.com"])).toBe(false);
  });
});

describe("networkDecision — deny wins over allow", () => {
  it("denies a denied domain even when allow is true (deny-wins)", () => {
    expect(networkDecision("evil.com", { allow: true, deniedDomains: ["evil.com"] })).toBe("deny");
    expect(networkDecision("api.evil.com", { allow: true, deniedDomains: ["evil.com"] })).toBe("deny");
  });

  it("allows a non-denied domain when allow is true", () => {
    expect(networkDecision("good.com", { allow: true, deniedDomains: ["evil.com"] })).toBe("allow");
  });

  it("denies a non-denied domain when allow is false", () => {
    expect(networkDecision("good.com", { allow: false, deniedDomains: ["evil.com"] })).toBe("deny");
  });

  it("empty deny list reduces to the allow decision (current behavior)", () => {
    expect(networkDecision("good.com", { allow: true, deniedDomains: [] })).toBe("allow");
    expect(networkDecision("good.com", { allow: false, deniedDomains: [] })).toBe("deny");
  });
});
