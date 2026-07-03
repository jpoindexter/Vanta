import { describe, it, expect } from "vitest";
import { webSearchTool, searchAcross } from "./web-search.js";
import type { ToolContext } from "./types.js";
import type { SearchConfig, SearchProvider, SearchResult } from "../search/interface.js";

// Validation runs before any provider/network call, so a no-op ctx is enough.
const ctx = {} as ToolContext;

describe("webSearchTool argument validation", () => {
  it("returns an actionable error when query is missing", async () => {
    const result = await webSearchTool.execute({}, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("returns an actionable error when query is an empty string", async () => {
    const result = await webSearchTool.execute({ query: "" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("rejects max_results above the allowed range", async () => {
    const result = await webSearchTool.execute(
      { query: "vanta", max_results: 11 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe('web_search needs a "query" string');
  });

  it("describes the safety-relevant query without touching the network", () => {
    const description = webSearchTool.describeForSafety?.({ query: "vanta ts" });

    expect(description).toBe("web search: vanta ts");
  });

  it("rejects passing both allowed_domains and excluded_domains", async () => {
    const result = await webSearchTool.execute(
      { query: "vanta", allowed_domains: ["x.com"], excluded_domains: ["y.com"] },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/mutually exclusive/);
  });
});

// A recording provider: captures the (query, config) it was called with so the
// tests can assert how searchAcross routed the domain scope + category/page.
function recorder(opts: { id: string; filtersDomains?: boolean; results?: SearchResult[] }): {
  provider: SearchProvider;
  calls: Array<{ query: string; config?: SearchConfig }>;
} {
  const calls: Array<{ query: string; config?: SearchConfig }> = [];
  const provider: SearchProvider = {
    id: opts.id,
    filtersDomains: opts.filtersDomains,
    async search(query, config) {
      calls.push({ query, config });
      return opts.results ?? [{ title: "t", url: "https://x/1", snippet: "s" }];
    },
  };
  return { provider, calls };
}

describe("searchAcross domain scoping (WEB-DOMAIN-SCOPING)", () => {
  it("rewrites the query with site: for a non-native provider (no domain config passed)", async () => {
    const rec = recorder({ id: "ddg" });
    const out = await searchAcross([rec.provider], "rust async", { allowedDomains: ["docs.rs"] });
    expect(out.kind).toBe("hit");
    expect(rec.calls[0]?.query).toBe("rust async site:docs.rs");
    expect(rec.calls[0]?.config?.allowedDomains).toBeUndefined(); // rewrite path drops domain config
  });

  it("passes domains through to a native-filtering provider (raw query, no rewrite)", async () => {
    const rec = recorder({ id: "grok", filtersDomains: true });
    await searchAcross([rec.provider], "rust async", { allowedDomains: ["docs.rs"] });
    expect(rec.calls[0]?.query).toBe("rust async"); // NOT rewritten
    expect(rec.calls[0]?.config?.allowedDomains).toEqual(["docs.rs"]);
  });

  it("leaves the query untouched when there is no scope", async () => {
    const rec = recorder({ id: "ddg" });
    await searchAcross([rec.provider], "plain query", {});
    expect(rec.calls[0]?.query).toBe("plain query");
  });
});

describe("searchAcross fallback + category/page passthrough", () => {
  it("falls through an empty provider to the next and reports all-failed", async () => {
    const empty = recorder({ id: "a", results: [] });
    const hit = recorder({ id: "b" });
    const out = await searchAcross([empty.provider, hit.provider], "q", {});
    expect(out.kind).toBe("hit");
    expect(empty.calls).toHaveLength(1); // tried, empty, fell through

    const throwing: SearchProvider = { id: "c", async search() { throw new Error("boom"); } };
    const failOut = await searchAcross([throwing], "q", {});
    expect(failOut).toEqual({ kind: "fail", failures: ["c: boom"] });
  });

  it("forwards category + page in the config unchanged (backend decides)", async () => {
    const rec = recorder({ id: "searxng" });
    await searchAcross([rec.provider], "q", { category: "news", page: 2, maxResults: 3 });
    expect(rec.calls[0]?.config).toMatchObject({ category: "news", page: 2, maxResults: 3 });
  });
});
