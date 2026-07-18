import { describe, it, expect } from "vitest";
import { mapBraveResults, BraveBrowserProvider } from "./brave-browser.js";

describe("mapBraveResults", () => {
  it("shapes rows, dropping title/url-less + brave.com + dupes, trimming snippets", () => {
    const raw = [
      { title: "Anthropic", url: "https://anthropic.com", snippet: "AI safety" },
      { title: "", url: "https://x.com" }, // no title → dropped
      { title: "No URL", url: "" }, // no url → dropped
      { title: "Brave internal", url: "https://search.brave.com/x" }, // brave.com → dropped
      { title: "Anthropic", url: "https://anthropic.com" }, // dup url → dropped
      { title: "Claude", url: "https://claude.com", snippet: "  spaced  " },
    ];
    expect(mapBraveResults(raw, 5)).toEqual([
      { title: "Anthropic", url: "https://anthropic.com", snippet: "AI safety" },
      { title: "Claude", url: "https://claude.com", snippet: "spaced" },
    ]);
  });

  it("caps to max", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://e${i}.com` }));
    expect(mapBraveResults(raw, 3)).toHaveLength(3);
  });

  it("returns [] for non-array / garbage input", () => {
    expect(mapBraveResults(null, 5)).toEqual([]);
    expect(mapBraveResults("nope", 5)).toEqual([]);
  });
});

describe("BraveBrowserProvider (injected page)", () => {
  it("navigates Brave and maps the page's extracted rows, then closes the browser", async () => {
    let gotoUrl = "";
    let closed = false;
    let waitedFor = "";
    const fakePage = {
      goto: async (url: string) => { gotoUrl = url; },
      waitForSelector: async (selector: string) => { waitedFor = selector; },
      waitForTimeout: async () => {},
      evaluate: async () => [
        { title: "Result One", url: "https://one.com", snippet: "first" },
        { title: "Result Two", url: "https://two.com", snippet: "second" },
      ],
    };
    const acquire = (async () => ({ page: fakePage, close: async () => { closed = true; } })) as never;
    const p = new BraveBrowserProvider({ acquire, chromium: {} });
    const out = await p.search("anthropic news", { maxResults: 5 });

    expect(p.id).toBe("brave_browser");
    expect(gotoUrl).toContain("search.brave.com/search?q=anthropic%20news");
    expect(waitedFor).toContain(".result-wrapper");
    expect(out).toEqual([
      { title: "Result One", url: "https://one.com", snippet: "first" },
      { title: "Result Two", url: "https://two.com", snippet: "second" },
    ]);
    expect(closed).toBe(true);
  });

  it("closes the browser even when navigation throws", async () => {
    let closed = false;
    const fakePage = { goto: async () => { throw new Error("net"); }, evaluate: async () => [] };
    const acquire = (async () => ({ page: fakePage, close: async () => { closed = true; } })) as never;
    const p = new BraveBrowserProvider({ acquire, chromium: {} });
    await expect(p.search("x")).rejects.toThrow("net");
    expect(closed).toBe(true);
  });
});
