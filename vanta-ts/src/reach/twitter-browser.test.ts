import { describe, expect, it } from "vitest";
import { postsFromBrowserResponses, twitterSearchPage } from "./twitter-browser.js";

const timeline = {
  data: {
    tweet: {
      rest_id: "42",
      legacy: { full_text: "Useful result", favorite_count: 7 },
      core: { user_results: { result: { legacy: { screen_name: "vanta" } } } },
    },
  },
};

describe("twitter browser search", () => {
  it("builds an encoded Latest search page", () => {
    const url = new URL(twitterSearchPage({ query: "AI agents", latest: true }));
    expect(url.origin + url.pathname).toBe("https://x.com/search");
    expect(url.searchParams.get("q")).toBe("AI agents");
    expect(url.searchParams.get("f")).toBe("live");
  });

  it("parses only a successful SearchTimeline response", () => {
    const result = postsFromBrowserResponses([
      { url: "https://x.com/other", status: 200, json: {} },
      { url: "https://x.com/i/api/graphql/id/SearchTimeline", status: 200, json: timeline },
    ], 1);
    expect(result).toMatchObject({ ok: true, posts: [{ handle: "vanta", text: "Useful result" }] });
  });

  it("fails honestly when the browser emits no search response", () => {
    expect(postsFromBrowserResponses([], 3)).toEqual({
      ok: false,
      error: "X browser search emitted no SearchTimeline response",
    });
  });
});
