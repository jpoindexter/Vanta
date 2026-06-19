import { describe, it, expect } from "vitest";
import { parseMattermostPosts, parseChannelAllowlist } from "./mattermost.js";

// A PostList as Mattermost returns it: `order` is newest-first, `posts` is a map.
const postList = {
  order: ["p3", "p2", "p1"],
  posts: {
    p1: { id: "p1", create_at: 100, user_id: "alice", channel_id: "c1", message: "first" },
    p2: { id: "p2", create_at: 200, user_id: "bob", channel_id: "c1", message: "second" },
    p3: { id: "p3", create_at: 300, user_id: "alice", channel_id: "c1", message: "third" },
  },
};

describe("parseMattermostPosts", () => {
  it("emits posts oldest-first and advances the cursor to the newest create_at", () => {
    const { messages, lastCreateAt } = parseMattermostPosts(postList, 0, "bot");
    expect(messages).toEqual([
      { chatId: "c1", text: "first", from: "alice" },
      { chatId: "c1", text: "second", from: "bob" },
      { chatId: "c1", text: "third", from: "alice" },
    ]);
    expect(lastCreateAt).toBe(300);
  });

  it("only returns posts newer than the current cursor (but still advances it)", () => {
    const { messages, lastCreateAt } = parseMattermostPosts(postList, 200, "bot");
    expect(messages).toEqual([{ chatId: "c1", text: "third", from: "alice" }]);
    expect(lastCreateAt).toBe(300);
  });

  it("skips the bot's own posts so it never replies to itself", () => {
    const { messages } = parseMattermostPosts(postList, 0, "alice");
    expect(messages).toEqual([{ chatId: "c1", text: "second", from: "bob" }]);
  });

  it("skips system posts (non-empty type) and empty/whitespace bodies", () => {
    const payload = {
      order: ["s1", "e1", "u1"],
      posts: {
        s1: { id: "s1", create_at: 10, user_id: "alice", channel_id: "c1", message: "joined", type: "system_join_channel" },
        e1: { id: "e1", create_at: 20, user_id: "alice", channel_id: "c1", message: "   " },
        u1: { id: "u1", create_at: 30, user_id: "alice", channel_id: "c1", message: "real" },
      },
    };
    const { messages, lastCreateAt } = parseMattermostPosts(payload, 0, "bot");
    expect(messages).toEqual([{ chatId: "c1", text: "real", from: "alice" }]);
    expect(lastCreateAt).toBe(30);
  });

  it("tolerates an order id missing from the posts map", () => {
    const payload = {
      order: ["missing", "p1"],
      posts: { p1: { id: "p1", create_at: 50, user_id: "alice", channel_id: "c1", message: "ok" } },
    };
    const { messages, lastCreateAt } = parseMattermostPosts(payload, 0, "bot");
    expect(messages).toEqual([{ chatId: "c1", text: "ok", from: "alice" }]);
    expect(lastCreateAt).toBe(50);
  });

  it("returns a no-op (keeps the cursor) on a malformed payload", () => {
    expect(parseMattermostPosts("garbage", 7, "bot")).toEqual({ messages: [], lastCreateAt: 7 });
    expect(parseMattermostPosts({ posts: {} }, 9, "bot")).toEqual({ messages: [], lastCreateAt: 9 });
  });
});

describe("parseChannelAllowlist", () => {
  it("parses a comma list of channel ids, trimming and dropping empties", () => {
    expect(parseChannelAllowlist(" c1, c2 ,")).toEqual(new Set(["c1", "c2"]));
  });
  it("is empty (allow-all) for undefined", () => {
    expect(parseChannelAllowlist(undefined).size).toBe(0);
  });
});
