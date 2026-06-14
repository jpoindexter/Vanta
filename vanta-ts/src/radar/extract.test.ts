import { describe, it, expect } from "vitest";
import { extractOpportunities, fromReddit, fromFeed, fromTwitter } from "./extract.js";
import type { SearchResult } from "../search/interface.js";
import type { RedditPost } from "../reach/reddit-parse.js";
import type { FeedItem } from "../reach/rss-parse.js";
import type { TwitterPost } from "../reach/twitter.js";

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

describe("source label + adapters", () => {
  it("prefixes the id + note with the source", () => {
    const r: SearchResult = { title: "Manual deploys are a nightmare", url: "https://reddit.com/r/devops/x", snippet: "team waste hours" };
    const [opp] = extractOpportunities([r], "deploys", "reddit");
    expect(opp!.id.startsWith("reddit-")).toBe(true);
    expect(opp!.note).toContain("via reddit scan");
  });

  it("fromReddit maps posts to the common result shape (permalink url, body snippet)", () => {
    const posts: RedditPost[] = [
      { title: "X is broken", author: "a", subreddit: "saas", score: 9, comments: 3, permalink: "/r/saas/1", body: "we waste money" },
      { title: "No body", author: "b", subreddit: "saas", score: 1, comments: 0, permalink: "/r/saas/2", body: "" },
    ];
    const results = fromReddit(posts);
    expect(results[0]).toEqual({ title: "X is broken", url: "https://www.reddit.com/r/saas/1", snippet: "we waste money" });
    expect(results[1]!.snippet).toContain("r/saas · ↑1"); // falls back to meta when body empty
  });

  it("fromFeed maps items to the common result shape", () => {
    const items: FeedItem[] = [{ title: "Release 2.0", link: "https://blog/2", date: "", summary: "fixes a painful bug" }];
    expect(fromFeed(items)[0]).toEqual({ title: "Release 2.0", url: "https://blog/2", snippet: "fixes a painful bug" });
  });

  it("fromTwitter maps tweets (title = text, snippet carries handle + likes)", () => {
    const posts: TwitterPost[] = [{ text: "manual invoicing wastes my whole week", handle: "founder", url: "https://x.com/founder/status/1", likes: 42 }];
    const r = fromTwitter(posts)[0]!;
    expect(r.url).toBe("https://x.com/founder/status/1");
    expect(r.snippet).toContain("@founder · ♥42");
    expect(r.title).toContain("manual invoicing");
  });

  it("end-to-end: reddit posts → opportunities scored from pain/buyer", () => {
    const posts: RedditPost[] = [
      { title: "Our team wastes budget on a broken manual process", author: "a", subreddit: "startups", score: 50, comments: 12, permalink: "/r/startups/abc", body: "expensive and slow" },
    ];
    const [opp] = extractOpportunities(fromReddit(posts), "process pain", "reddit");
    expect(opp!.pain!).toBeGreaterThan(0);
    expect(opp!.buyer!).toBeGreaterThan(0);
    expect(opp!.source).toBe("https://www.reddit.com/r/startups/abc");
  });
});
