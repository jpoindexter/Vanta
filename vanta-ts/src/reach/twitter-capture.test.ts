import { describe, it, expect } from "vitest";
import { graphqlOp } from "./twitter-capture.js";

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
});
