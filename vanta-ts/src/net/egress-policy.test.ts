import { describe, it, expect } from "vitest";
import { domainMatches, parseEgressPolicy, checkEgressPolicy } from "./egress-policy.js";

describe("domainMatches", () => {
  it("a bare domain matches the apex and its sub-domains", () => {
    expect(domainMatches("evil.com", "evil.com")).toBe(true);
    expect(domainMatches("api.evil.com", "evil.com")).toBe(true);
    expect(domainMatches("notevil.com", "evil.com")).toBe(false);
    expect(domainMatches("evil.com.attacker.net", "evil.com")).toBe(false);
  });
  it("a *.x wildcard matches sub-domains (and the apex)", () => {
    expect(domainMatches("api.x.com", "*.x.com")).toBe(true);
    expect(domainMatches("x.com", "*.x.com")).toBe(true);
    expect(domainMatches("y.com", "*.x.com")).toBe(false);
  });
  it("is case-insensitive and ignores empty patterns", () => {
    expect(domainMatches("API.X.COM", "*.x.com")).toBe(true);
    expect(domainMatches("x.com", "")).toBe(false);
  });
});

describe("parseEgressPolicy", () => {
  it("reads comma lists from env", () => {
    const p = parseEgressPolicy({ VANTA_EGRESS_ALLOW: "a.com, b.com", VANTA_EGRESS_DENY: "evil.com" } as NodeJS.ProcessEnv);
    expect(p.allow).toEqual(["a.com", "b.com"]);
    expect(p.deny).toEqual(["evil.com"]);
  });
  it("empty env → empty lists (no policy)", () => {
    expect(parseEgressPolicy({} as NodeJS.ProcessEnv)).toEqual({ allow: [], deny: [] });
  });
});

describe("checkEgressPolicy", () => {
  it("allows everything when no policy is set", () => {
    expect(checkEgressPolicy("anything.com", { allow: [], deny: [] })).toEqual({ allowed: true });
  });
  it("denies a host on the deny list (deny wins)", () => {
    const d = checkEgressPolicy("api.evil.com", { allow: ["evil.com"], deny: ["evil.com"] });
    expect(d.allowed).toBe(false);
    expect((d as { reason: string }).reason).toMatch(/deny list/);
  });
  it("with an allow list, anything unlisted is denied (default-deny)", () => {
    const policy = { allow: ["github.com", "*.anthropic.com"], deny: [] };
    expect(checkEgressPolicy("api.github.com", policy)).toEqual({ allowed: true });
    expect(checkEgressPolicy("api.anthropic.com", policy)).toEqual({ allowed: true });
    const d = checkEgressPolicy("tracker.evil.com", policy);
    expect(d.allowed).toBe(false);
    expect((d as { reason: string }).reason).toMatch(/not in the allow list/);
  });
});
