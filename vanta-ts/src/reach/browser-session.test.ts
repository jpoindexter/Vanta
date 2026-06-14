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
  it("parses a header into url-scoped cookie objects (origin only)", () => {
    const out = cookieToPlaywright("auth_token=abc; ct0=def", "https://x.com/i/bookmarks");
    expect(out).toEqual([
      { name: "auth_token", value: "abc", url: "https://x.com" },
      { name: "ct0", value: "def", url: "https://x.com" },
    ]);
  });
  it("keeps __Host-/__Secure- prefixed names (valid tokens) + skips malformed pairs", () => {
    const out = cookieToPlaywright("a=1; broken; __Host-xx=2; bad name=3", "https://reddit.com/");
    expect(out.map((c) => c.name)).toEqual(["a", "__Host-xx"]); // "broken" (no =) + "bad name" (space) dropped
    expect(out[0]?.url).toBe("https://reddit.com");
  });
});
