import { describe, it, expect } from "vitest";
import type { Message } from "../types.js";
import {
  type SearchBoxState,
  findMatches,
  openSearchBox,
  updateSearchQuery,
  nextMatch,
  prevMatch,
  currentMatch,
  matchCountLabel,
} from "./search-box.js";

const user = (content: string): Message => ({ role: "user", content });
const assistant = (content: string): Message => ({ role: "assistant", content });
const system = (content: string): Message => ({ role: "system", content });
const tool = (content: string): Message => ({ role: "tool", toolCallId: "t1", name: "x", content });

describe("findMatches", () => {
  it("finds every occurrence within a single message in document order", () => {
    const msgs = [user("foo bar foo baz foo")];
    const matches = findMatches(msgs, "foo");
    expect(matches).toEqual([
      { messageIndex: 0, offset: 0, length: 3 },
      { messageIndex: 0, offset: 8, length: 3 },
      { messageIndex: 0, offset: 16, length: 3 },
    ]);
  });

  it("finds matches across multiple messages in message order", () => {
    const msgs = [user("alpha"), assistant("alpha alpha")];
    const matches = findMatches(msgs, "alpha");
    expect(matches).toEqual([
      { messageIndex: 0, offset: 0, length: 5 },
      { messageIndex: 1, offset: 0, length: 5 },
      { messageIndex: 1, offset: 6, length: 5 },
    ]);
  });

  it("is case-insensitive", () => {
    const msgs = [user("Hello HELLO hello")];
    const matches = findMatches(msgs, "hello");
    expect(matches.map((m) => m.offset)).toEqual([0, 6, 12]);
    expect(matches).toHaveLength(3);
  });

  it("skips system messages but searches user, assistant, and tool messages", () => {
    const msgs = [system("query here"), user("query"), assistant("query"), tool("query")];
    const matches = findMatches(msgs, "query");
    // index 0 (system) skipped; 1,2,3 matched.
    expect(matches.map((m) => m.messageIndex)).toEqual([1, 2, 3]);
  });

  it("returns no matches for an empty query", () => {
    expect(findMatches([user("anything")], "")).toEqual([]);
  });

  it("returns no matches for a whitespace-only query", () => {
    expect(findMatches([user("anything")], "   ")).toEqual([]);
  });

  it("returns no matches when the query is absent", () => {
    expect(findMatches([user("abc"), assistant("def")], "zzz")).toEqual([]);
  });

  it("does not double-count overlapping occurrences (advances by query length)", () => {
    // "aaaa" with query "aa" → non-overlapping hits at 0 and 2.
    const matches = findMatches([user("aaaa")], "aa");
    expect(matches.map((m) => m.offset)).toEqual([0, 2]);
  });

  it("trims the query before matching", () => {
    const matches = findMatches([user("cat")], "  cat  ");
    expect(matches).toEqual([{ messageIndex: 0, offset: 0, length: 3 }]);
  });
});

describe("openSearchBox", () => {
  it("opens an empty, idle state", () => {
    expect(openSearchBox()).toEqual({ query: "", matches: [], current: -1 });
  });
});

describe("updateSearchQuery", () => {
  const msgs = [user("foo foo"), assistant("foo")];

  it("re-finds matches and resets current to 0 when there are matches", () => {
    const next = updateSearchQuery(openSearchBox(), "foo", msgs);
    expect(next.query).toBe("foo");
    expect(next.matches).toHaveLength(3);
    expect(next.current).toBe(0);
  });

  it("sets current to -1 when there are no matches", () => {
    const next = updateSearchQuery(openSearchBox(), "zzz", msgs);
    expect(next.matches).toEqual([]);
    expect(next.current).toBe(-1);
  });

  it("resets current to 0 even after the cursor had been advanced", () => {
    const opened = updateSearchQuery(openSearchBox(), "foo", msgs);
    const advanced = nextMatch(nextMatch(opened));
    expect(advanced.current).toBe(2);
    const reset = updateSearchQuery(advanced, "foo", msgs);
    expect(reset.current).toBe(0);
  });

  it("treats an empty query as no matches, current -1", () => {
    const next = updateSearchQuery(openSearchBox(), "", msgs);
    expect(next.matches).toEqual([]);
    expect(next.current).toBe(-1);
  });

  it("never mutates the input state", () => {
    const before = updateSearchQuery(openSearchBox(), "foo", msgs);
    const snapshot: SearchBoxState = { query: before.query, matches: before.matches, current: before.current };
    updateSearchQuery(before, "zzz", msgs);
    expect(before).toEqual(snapshot);
  });
});

describe("nextMatch / prevMatch (wrap navigation)", () => {
  const msgs = [user("x x x")]; // 3 matches at offsets 0,2,4

  const opened = (): SearchBoxState => updateSearchQuery(openSearchBox(), "x", msgs);

  it("nextMatch advances by one", () => {
    expect(nextMatch(opened()).current).toBe(1);
  });

  it("nextMatch wraps from the last match back to the first", () => {
    const atLast = updateSearchQuery({ ...opened(), current: 2 }, "x", msgs);
    // re-update keeps 3 matches; force current to last then step.
    const last = { ...atLast, current: 2 };
    expect(nextMatch(last).current).toBe(0);
  });

  it("prevMatch retreats by one", () => {
    const atOne = { ...opened(), current: 1 };
    expect(prevMatch(atOne).current).toBe(0);
  });

  it("prevMatch wraps from the first match back to the last", () => {
    expect(prevMatch(opened()).current).toBe(2);
  });

  it("a full forward cycle returns to the start", () => {
    let s = opened();
    s = nextMatch(nextMatch(nextMatch(s)));
    expect(s.current).toBe(0);
  });

  it("navigation on an empty/no-match state stays at -1 (no navigation)", () => {
    const none = updateSearchQuery(openSearchBox(), "zzz", msgs);
    expect(nextMatch(none).current).toBe(-1);
    expect(prevMatch(none).current).toBe(-1);
  });

  it("never mutates the input state", () => {
    const s = opened();
    const snapshot = { query: s.query, matches: s.matches, current: s.current };
    nextMatch(s);
    prevMatch(s);
    expect(s).toEqual(snapshot);
  });
});

describe("currentMatch", () => {
  const msgs = [user("hit"), assistant("hit hit")];

  it("returns the Match the cursor points at", () => {
    const s = updateSearchQuery(openSearchBox(), "hit", msgs);
    expect(currentMatch(s)).toEqual({ messageIndex: 0, offset: 0, length: 3 });
    expect(currentMatch(nextMatch(s))).toEqual({ messageIndex: 1, offset: 0, length: 3 });
  });

  it("returns null when there are no matches", () => {
    const s = updateSearchQuery(openSearchBox(), "zzz", msgs);
    expect(currentMatch(s)).toBeNull();
  });

  it("returns null for an empty (just-opened) box", () => {
    expect(currentMatch(openSearchBox())).toBeNull();
  });
});

describe("matchCountLabel", () => {
  const msgs = Array.from({ length: 12 }, () => user("match"));

  it('renders "X of N" with a 1-based current', () => {
    const s = updateSearchQuery(openSearchBox(), "match", msgs);
    expect(matchCountLabel(s)).toBe("1 of 12");
    expect(matchCountLabel(nextMatch(nextMatch(s)))).toBe("3 of 12");
  });

  it('renders "no matches" for a non-empty query with zero hits', () => {
    const s = updateSearchQuery(openSearchBox(), "zzz", msgs);
    expect(matchCountLabel(s)).toBe("no matches");
  });

  it('renders "" for an empty query', () => {
    expect(matchCountLabel(openSearchBox())).toBe("");
    expect(matchCountLabel(updateSearchQuery(openSearchBox(), "   ", msgs))).toBe("");
  });
});
