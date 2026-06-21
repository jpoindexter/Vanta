import { describe, it, expect } from "vitest";
import {
  buildSessionSearchPrompt,
  parseSessionSearchResult,
  lexicalSessionSearch,
  searchSessions,
  type SessionCandidate,
  type SessionSearchMatch,
} from "./agentic-search.js";

/** First match, asserting the list is non-empty (narrows for strict indexing). */
function first(matches: SessionSearchMatch[]): SessionSearchMatch {
  const head = matches[0];
  expect(head).toBeDefined();
  if (!head) throw new Error("expected at least one match");
  return head;
}

const CANDIDATES: SessionCandidate[] = [
  {
    id: "20260601-090000",
    title: "Set up the kernel HTTP server on port 7788",
    preview: "added a raw TCP HTTP/1.1 sidecar serving /api/assess and /api/status",
  },
  {
    id: "20260602-120000",
    title: "Refactor the brain region store",
    preview: "split brain/regions.ts and brain/store.ts into md-region layers",
  },
  {
    id: "20260603-150000",
    title: "Fix the resume picker preview",
    preview: "buildSessionPreview now strips ANSI and caps the snippet length",
  },
];

describe("buildSessionSearchPrompt", () => {
  it("references the query and every candidate title + id", () => {
    const prompt = buildSessionSearchPrompt("where did I set up the http server", CANDIDATES);
    expect(prompt).toContain("where did I set up the http server");
    for (const candidate of CANDIDATES) {
      expect(prompt).toContain(candidate.id);
      expect(prompt).toContain(candidate.title);
    }
  });

  it("asks for a JSON array of id + why (no fences)", () => {
    const prompt = buildSessionSearchPrompt("kernel", CANDIDATES);
    expect(prompt).toMatch(/JSON array/i);
    expect(prompt).toContain('"id"');
    expect(prompt).toContain('"why"');
    expect(prompt).toMatch(/no.+fences/i);
  });

  it("clips an oversized preview and collapses whitespace", () => {
    const long: SessionCandidate = {
      id: "x",
      title: "t",
      preview: "word ".repeat(200),
    };
    const prompt = buildSessionSearchPrompt("q", [long]);
    expect(prompt).toContain("…");
    expect(prompt).not.toContain("word  word"); // whitespace collapsed
  });

  it("caps the number of candidates embedded in the prompt", () => {
    const many: SessionCandidate[] = Array.from({ length: 60 }, (_, i) => ({
      id: `id-${i}`,
      title: `title ${i}`,
      preview: `preview ${i}`,
    }));
    const prompt = buildSessionSearchPrompt("q", many);
    expect(prompt).toContain("id-0");
    expect(prompt).toContain("id-39"); // 40th candidate present
    expect(prompt).not.toContain("id-40"); // 41st dropped
  });
});

describe("parseSessionSearchResult", () => {
  const validIds = CANDIDATES.map((c) => c.id);

  it("keeps only valid ids and preserves order", () => {
    const response = JSON.stringify([
      { id: "20260601-090000", why: "kernel HTTP server setup" },
      { id: "20260603-150000", why: "preview fix" },
    ]);
    expect(parseSessionSearchResult(response, validIds)).toEqual([
      { id: "20260601-090000", why: "kernel HTTP server setup" },
      { id: "20260603-150000", why: "preview fix" },
    ]);
  });

  it("drops hallucinated ids not in the candidate set", () => {
    const response = JSON.stringify([
      { id: "99999999-000000", why: "made up" },
      { id: "20260602-120000", why: "real" },
    ]);
    expect(parseSessionSearchResult(response, validIds)).toEqual([
      { id: "20260602-120000", why: "real" },
    ]);
  });

  it("tolerates code fences and surrounding prose", () => {
    const response =
      'Here are the matches:\n```json\n[{"id":"20260601-090000","why":"setup"}]\n```\nDone.';
    expect(parseSessionSearchResult(response, validIds)).toEqual([
      { id: "20260601-090000", why: "setup" },
    ]);
  });

  it("returns [] on garbage / invalid JSON / no array", () => {
    expect(parseSessionSearchResult("not json at all", validIds)).toEqual([]);
    expect(parseSessionSearchResult("[ broken", validIds)).toEqual([]);
    expect(parseSessionSearchResult("{}", validIds)).toEqual([]);
    expect(parseSessionSearchResult("", validIds)).toEqual([]);
  });

  it("defaults why to '' when absent or non-string, and skips non-object elements", () => {
    const response = JSON.stringify([
      { id: "20260601-090000" },
      "20260602-120000",
      42,
      { id: "20260603-150000", why: 7 },
    ]);
    expect(parseSessionSearchResult(response, validIds)).toEqual([
      { id: "20260601-090000", why: "" },
      { id: "20260603-150000", why: "" },
    ]);
  });

  it("de-duplicates repeated ids (first occurrence wins)", () => {
    const response = JSON.stringify([
      { id: "20260601-090000", why: "first" },
      { id: "20260601-090000", why: "second" },
    ]);
    expect(parseSessionSearchResult(response, validIds)).toEqual([
      { id: "20260601-090000", why: "first" },
    ]);
  });
});

describe("lexicalSessionSearch", () => {
  it("ranks by title/preview substring match (case-insensitive)", () => {
    const matches = lexicalSessionSearch("HTTP server", CANDIDATES);
    expect(first(matches).id).toBe("20260601-090000");
    expect(first(matches).why).toContain("matches:");
  });

  it("weights a title hit above a preview-only hit", () => {
    const candidates: SessionCandidate[] = [
      { id: "preview-only", title: "unrelated", preview: "discusses the kernel design" },
      { id: "title-hit", title: "kernel work", preview: "unrelated body" },
    ];
    const matches = lexicalSessionSearch("kernel", candidates);
    expect(first(matches).id).toBe("title-hit");
  });

  it("excludes zero-score candidates and returns [] for an empty/short query", () => {
    expect(lexicalSessionSearch("zzz-nomatch", CANDIDATES)).toEqual([]);
    expect(lexicalSessionSearch("", CANDIDATES)).toEqual([]);
    expect(lexicalSessionSearch("a", CANDIDATES)).toEqual([]); // single-char token dropped
  });

  it("is deterministic — ties break by title ascending", () => {
    const tied: SessionCandidate[] = [
      { id: "b", title: "beta kernel", preview: "" },
      { id: "a", title: "alpha kernel", preview: "" },
    ];
    const matches = lexicalSessionSearch("kernel", tied);
    expect(matches.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("searchSessions", () => {
  const okComplete = async (): Promise<string> =>
    JSON.stringify([{ id: "20260601-090000", why: "semantic: kernel HTTP server setup" }]);

  it("returns the agentic result when enabled and the call succeeds", async () => {
    const matches = await searchSessions("where did I build the server", CANDIDATES, {
      enabled: true,
      complete: okComplete,
    });
    expect(matches).toEqual([
      { id: "20260601-090000", why: "semantic: kernel HTTP server setup" },
    ]);
  });

  it("passes the built prompt (with the query) to the injected complete", async () => {
    let seen = "";
    await searchSessions("my unique query phrase", CANDIDATES, {
      enabled: true,
      complete: async (prompt) => {
        seen = prompt;
        return okComplete();
      },
    });
    expect(seen).toContain("my unique query phrase");
    expect(seen).toContain("20260601-090000");
  });

  it("falls back to lexical when disabled (no model call)", async () => {
    let called = false;
    const matches = await searchSessions("HTTP server", CANDIDATES, {
      enabled: false,
      complete: async () => {
        called = true;
        return "[]";
      },
    });
    expect(called).toBe(false);
    expect(first(matches).id).toBe("20260601-090000");
    expect(first(matches).why).toContain("matches:"); // lexical why, not semantic
  });

  it("falls back to lexical when the model call throws", async () => {
    const matches = await searchSessions("HTTP server", CANDIDATES, {
      enabled: true,
      complete: async () => {
        throw new Error("provider exploded");
      },
    });
    expect(first(matches).id).toBe("20260601-090000");
    expect(first(matches).why).toContain("matches:");
  });

  it("falls back to lexical when the model returns no valid matches", async () => {
    const matches = await searchSessions("HTTP server", CANDIDATES, {
      enabled: true,
      complete: async () => JSON.stringify([{ id: "hallucinated", why: "nope" }]),
    });
    expect(first(matches).id).toBe("20260601-090000");
  });

  it("never throws and returns [] for an empty candidate list", async () => {
    await expect(
      searchSessions("anything", [], { enabled: true, complete: okComplete }),
    ).resolves.toEqual([]);
    await expect(
      searchSessions("anything", [], { enabled: false, complete: okComplete }),
    ).resolves.toEqual([]);
  });
});
