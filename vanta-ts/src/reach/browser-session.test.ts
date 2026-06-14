import { describe, it, expect } from "vitest";
import { domainOf, cookieToPlaywright } from "./browser-session.js";

describe("domainOf", () => {
  it("extracts the host + drops www", () => {
    expect(domainOf("https://x.com/i/bookmarks")).toBe("x.com");
    expect(domainOf("https://www.reddit.com/r/x")).toBe("reddit.com");
    expect(domainOf("https://old.reddit.com/")).toBe("old.reddit.com");
  });
  it("returns empty on a non-url", () => {
    expect(domainOf("not a url")).toBe("");
  });
});

describe("cookieToPlaywright", () => {
  it("parses a header into domain-scoped cookie objects", () => {
    const out = cookieToPlaywright("auth_token=abc; ct0=def", "x.com");
    expect(out).toEqual([
      { name: "auth_token", value: "abc", domain: ".x.com", path: "/", secure: true },
      { name: "ct0", value: "def", domain: ".x.com", path: "/", secure: true },
    ]);
  });
  it("keeps a leading-dot domain + skips malformed pairs", () => {
    const out = cookieToPlaywright("a=1; broken; b=2", ".reddit.com");
    expect(out.map((c) => c.name)).toEqual(["a", "b"]);
    expect(out[0]?.domain).toBe(".reddit.com");
  });
});
