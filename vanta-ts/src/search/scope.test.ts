import { describe, it, expect } from "vitest";
import { validateDomainScope, scopeQuery, hasDomainScope, MAX_SCOPE_DOMAINS } from "./scope.js";

describe("validateDomainScope", () => {
  it("accepts a single-sided list and an empty scope", () => {
    expect(validateDomainScope({})).toBeNull();
    expect(validateDomainScope({ allowedDomains: ["x.com"] })).toBeNull();
    expect(validateDomainScope({ excludedDomains: ["a.com", "b.com"] })).toBeNull();
  });

  it("rejects passing both allowed and excluded (mutually exclusive)", () => {
    const err = validateDomainScope({ allowedDomains: ["x.com"], excludedDomains: ["y.com"] });
    expect(err).toMatch(/mutually exclusive/);
  });

  it("rejects more than the cap", () => {
    const many = Array.from({ length: MAX_SCOPE_DOMAINS + 1 }, (_, i) => `d${i}.com`);
    expect(validateDomainScope({ allowedDomains: many })).toMatch(/at most 10 domains/);
  });

  it("rejects a blank domain entry", () => {
    expect(validateDomainScope({ allowedDomains: ["x.com", "   "] })).toMatch(/non-empty hosts/);
  });
});

describe("hasDomainScope", () => {
  it("is true only when a list is non-empty", () => {
    expect(hasDomainScope({})).toBe(false);
    expect(hasDomainScope({ allowedDomains: [] })).toBe(false);
    expect(hasDomainScope({ allowedDomains: ["x.com"] })).toBe(true);
    expect(hasDomainScope({ excludedDomains: ["y.com"] })).toBe(true);
  });
});

describe("scopeQuery", () => {
  it("appends a single site: filter for one allowed domain", () => {
    expect(scopeQuery("rust async", { allowedDomains: ["docs.rs"] })).toBe("rust async site:docs.rs");
  });

  it("ORs multiple allowed domains inside parens", () => {
    expect(scopeQuery("react hooks", { allowedDomains: ["react.dev", "github.com"] })).toBe(
      "react hooks (site:react.dev OR site:github.com)",
    );
  });

  it("appends -site: filters for excluded domains", () => {
    expect(scopeQuery("news", { excludedDomains: ["pinterest.com", "quora.com"] })).toBe(
      "news -site:pinterest.com -site:quora.com",
    );
  });

  it("normalizes scheme/path/case and leaves an empty scope untouched", () => {
    expect(scopeQuery("q", { allowedDomains: ["HTTPS://Docs.RS/std"] })).toBe("q site:docs.rs");
    expect(scopeQuery("q", {})).toBe("q");
  });
});
