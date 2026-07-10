import { describe, it, expect } from "vitest";
import { capturedQueryIds, graphqlOp } from "./twitter-capture.js";

describe("graphqlOp", () => {
  it("extracts op + queryId from an X GraphQL request URL", () => {
    expect(graphqlOp("https://x.com/i/api/graphql/i8QZ1qqy36ffA3bxfTaf7w/Bookmarks?variables=%7B%7D")).toEqual({
      op: "Bookmarks",
      qid: "i8QZ1qqy36ffA3bxfTaf7w",
    });
    expect(graphqlOp("https://x.com/i/api/graphql/abc123/SearchTimeline")).toEqual({ op: "SearchTimeline", qid: "abc123" });
  });

  it("returns null for non-graphql urls", () => {
    expect(graphqlOp("https://x.com/i/bookmarks")).toBeNull();
    expect(graphqlOp("https://abs.twimg.com/x.js")).toBeNull();
  });

  it("does not count stale cached ids as live observations", () => {
    const result = capturedQueryIds({ SearchTimeline: "STALE", Bookmarks: "OLD" }, []);
    expect(result).toEqual({ merged: { SearchTimeline: "STALE", Bookmarks: "OLD" }, observed: [], changed: 0 });
  });

  it("records operations actually observed in browser requests", () => {
    const result = capturedQueryIds(
      { SearchTimeline: "STALE" },
      [
        "https://x.com/i/api/graphql/FRESH/SearchTimeline",
        "https://x.com/i/api/graphql/BOOK/Bookmarks?variables=x",
      ],
    );
    expect(result.observed.sort()).toEqual(["Bookmarks", "SearchTimeline"]);
    expect(result.changed).toBe(2);
    expect(result.merged).toMatchObject({ SearchTimeline: "FRESH", Bookmarks: "BOOK" });
  });
});
