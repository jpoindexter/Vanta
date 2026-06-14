import { describe, it, expect } from "vitest";
import { extractOpportunities } from "./extract.js";
import type { SearchResult } from "../search/interface.js";

// Inline fixtures — no network, deterministic.

const highPain: SearchResult = {
  title: "I hate how slow and manual this process is",
  url: "https://example.com/posts/manual-process",
  snippet: "Every team is frustrated with the expensive, tedious workflow. Nightmare to maintain.",
};

const highBuyer: SearchResult = {
  title: "Enterprise SaaS platform for B2B teams",
  url: "https://example.com/enterprise-saas",
  snippet: "Businesses spend heavily on subscription software and vendor solutions.",
};

const neutral: SearchResult = {
  title: "Weather today in Valencia",
  url: "https://example.com/weather",
  snippet: "Sunny skies expected. Temperature 28°C.",
};

const dupUrl: SearchResult = {
  title: "Duplicate of manual process post",
  url: "https://example.com/posts/manual-process", // same url as highPain
  snippet: "This should be de-duped.",
};

const manyResults: SearchResult[] = Array.from({ length: 15 }, (_, i) => ({
  title: `Result ${i}`,
  url: `https://example.com/result-${i}`,
  snippet: `Snippet for result ${i}.`,
}));

describe("extractOpportunities", () => {
  it("returns empty array for empty input", () => {
    expect(extractOpportunities([], "test")).toEqual([]);
  });

  it("converts a result to an Opportunity with correct shape", () => {
    const [opp] = extractOpportunities([neutral], "weather");
    expect(opp).toBeDefined();
    expect(opp!.kind).toBe("opportunity");
    expect(opp!.title).toBe(neutral.title);
    expect(opp!.source).toBe(neutral.url);
    expect(opp!.status).toBe("new");
    expect(typeof opp!.pain).toBe("number");
    expect(typeof opp!.buyer).toBe("number");
    expect(opp!.note).toContain("weather");
  });

  it("scores pain words higher than a neutral result", () => {
    const [painOpp] = extractOpportunities([highPain], "process");
    const [neutralOpp] = extractOpportunities([neutral], "weather");
    expect(painOpp!.pain!).toBeGreaterThan(neutralOpp!.pain!);
  });

  it("scores buyer words higher than a neutral result", () => {
    const [buyerOpp] = extractOpportunities([highBuyer], "saas");
    const [neutralOpp] = extractOpportunities([neutral], "weather");
    expect(buyerOpp!.buyer!).toBeGreaterThan(neutralOpp!.buyer!);
  });

  it("de-dupes by URL — same url appears only once", () => {
    const results = [highPain, dupUrl];
    const opps = extractOpportunities(results, "test");
    expect(opps).toHaveLength(1);
    expect(opps[0]!.title).toBe(highPain.title);
  });

  it("caps output at 10 results regardless of input count", () => {
    const opps = extractOpportunities(manyResults, "many");
    expect(opps.length).toBeLessThanOrEqual(10);
  });

  it("carries the source URL on each opportunity", () => {
    const opps = extractOpportunities([highPain, highBuyer], "query");
    expect(opps.every((o) => typeof o.source === "string" && o.source.startsWith("http"))).toBe(true);
  });

  it("includes the query in the note field", () => {
    const opps = extractOpportunities([neutral], "my-test-query");
    expect(opps[0]!.note).toContain("my-test-query");
  });

  it("pain score is clamped to 0..1", () => {
    // max possible: all pain words in one hit — score = min(n/3, 1) ≤ 1
    const r: SearchResult = {
      title: MANY_PAIN_TITLE,
      url: "https://example.com/pain",
      snippet: MANY_PAIN_SNIPPET,
    };
    const [opp] = extractOpportunities([r], "pain");
    expect(opp!.pain!).toBeGreaterThanOrEqual(0);
    expect(opp!.pain!).toBeLessThanOrEqual(1);
  });
});

// Helper constants for the clamp test
const MANY_PAIN_TITLE = "frustrated hate broken manual waste slow expensive painful annoying tedious";
const MANY_PAIN_SNIPPET = "impossible nightmare struggle struggling problem issue bug fail failing crash crashes sucks terrible awful";
