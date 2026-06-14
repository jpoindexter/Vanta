import { describe, it, expect } from "vitest";
import { extractAuth, extractQueryIds, parseTimeline, graphqlError } from "./twitter-parse.js";

describe("extractAuth", () => {
  it("pulls auth_token + ct0 (ct0 = CSRF)", () => {
    expect(extractAuth("x=1; auth_token=abc; ct0=def; y=2")).toEqual({ authToken: "abc", ct0: "def" });
  });
  it("returns null when either is missing", () => {
    expect(extractAuth("auth_token=abc")).toBeNull();
    expect(extractAuth("ct0=def")).toBeNull();
  });
});

describe("extractQueryIds", () => {
  it("scrapes operation→queryId pairs (both orderings)", () => {
    const js = `a={queryId:"AAA111",operationName:"Bookmarks"};b={operationName:"SearchTimeline",metadata:{},queryId:"BBB222"}`;
    const ids = extractQueryIds(js);
    expect(ids.Bookmarks).toBe("AAA111");
    expect(ids.SearchTimeline).toBe("BBB222");
  });
  it("returns {} for js without query ids", () => {
    expect(extractQueryIds("console.log('hi')")).toEqual({});
  });
});

// A trimmed X GraphQL bookmarks response — the nesting parseTimeline walks.
const TIMELINE = {
  data: {
    bookmark_timeline_v2: {
      timeline: {
        instructions: [
          {
            type: "TimelineAddEntries",
            entries: [
              {
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        rest_id: "123",
                        core: { user_results: { result: { core: { screen_name: "jane" } } } }, // new X shape: handle in user core
                        legacy: { full_text: "doing invoices manually is painful", favorite_count: 7 },
                      },
                    },
                  },
                },
              },
              {
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        // TweetWithVisibilityResults wraps the real tweet under .tweet
                        tweet: {
                          rest_id: "456",
                          core: { user_results: { result: { legacy: { screen_name: "bob" } } } },
                          legacy: { full_text: "wasted hours on a broken tool", favorite_count: 3 },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  },
};

describe("parseTimeline", () => {
  it("walks the tree, extracting tweets incl. the .tweet-wrapped shape, deduped", () => {
    const posts = parseTimeline(TIMELINE);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual({ text: "doing invoices manually is painful", handle: "jane", likes: 7, url: "https://x.com/jane/status/123" });
    expect(posts[1]).toMatchObject({ handle: "bob", url: "https://x.com/bob/status/456" });
  });

  it("returns [] for an empty/garbage response, never throws", () => {
    expect(parseTimeline({})).toEqual([]);
    expect(parseTimeline(null)).toEqual([]);
  });
});

describe("graphqlError", () => {
  it("surfaces the first error message", () => {
    expect(graphqlError({ errors: [{ message: "Bad guest token" }] })).toBe("Bad guest token");
  });
  it("returns null when there are no errors", () => {
    expect(graphqlError({ data: {} })).toBeNull();
  });
});
