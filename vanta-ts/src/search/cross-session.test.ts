import { describe, it, expect } from "vitest";
import { searchSessions, type SearchableSession } from "./cross-session.js";

// Fixture corpus — three sessions, no fs. A fixed `now` keeps recency scoring
// deterministic. The session id doubles as a stable timestamp string so recency
// (which extracts an ISO-ish date from the snippet, none here) stays neutral and
// term/exact-phrase/title signals drive the ranking.
const NOW = Date.parse("2026-06-20T12:00:00Z");

const sessions: SearchableSession[] = [
  {
    id: "20260601-100000",
    title: "kernel safety review",
    messages: [
      { role: "system", content: "you are vanta" },
      { role: "user", content: "How does the deno permission model gate file writes?" },
      { role: "assistant", content: "It does not — this is a passing mention of permissions." },
    ],
  },
  {
    id: "20260610-100000",
    title: "deno permission model deep dive",
    messages: [
      { role: "user", content: "Walk me through the deno permission model end to end." },
      { role: "assistant", content: "The deno permission model uses allow-flags per resource." },
    ],
  },
  {
    id: "20260615-100000",
    title: "ui composer",
    messages: [
      { role: "user", content: "Make the cursor blink in the composer box." },
      { role: "tool", content: "" },
    ],
  },
];

describe("searchSessions", () => {
  it("returns empty for an empty query", () => {
    expect(searchSessions("", sessions, NOW)).toEqual([]);
    expect(searchSessions("   ", sessions, NOW)).toEqual([]);
  });

  it("returns empty when nothing matches", () => {
    expect(searchSessions("kubernetes helm chart", sessions, NOW)).toEqual([]);
  });

  it("ranks an exact phrase above a partial term match", () => {
    const hits = searchSessions("deno permission model", sessions, NOW);
    expect(hits.length).toBeGreaterThan(1);
    // The message containing the exact phrase + the title hit must rank first.
    expect(hits[0]!.snippet.toLowerCase()).toContain("deno permission model");
    expect(hits[0]!.sessionId).toBe("20260610-100000");
    // Scores are sorted descending.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it("returns the snippet and session context for each hit", () => {
    const hits = searchSessions("blink composer", sessions, NOW);
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.sessionId).toBe("20260615-100000");
    expect(hit.title).toBe("ui composer");
    expect(hit.messageIndex).toBe(0); // the user message, not the empty tool row
    expect(hit.snippet).toContain("cursor blink");
    expect(hit.score).toBeGreaterThan(0);
  });

  it("skips empty/missing message content", () => {
    const hits = searchSessions("composer", sessions, NOW);
    // Only the user message matches; the empty tool message is never a hit.
    expect(hits.every((h) => h.snippet.length > 0)).toBe(true);
    expect(hits.some((h) => h.messageIndex === 1 && h.sessionId === "20260615-100000")).toBe(false);
  });

  it("is case-insensitive on the query", () => {
    const lower = searchSessions("deno permission", sessions, NOW);
    const upper = searchSessions("DENO PERMISSION", sessions, NOW);
    expect(upper.map((h) => h.sessionId)).toEqual(lower.map((h) => h.sessionId));
  });

  it("defaults now to Date.now() when omitted (still returns ranked hits)", () => {
    const hits = searchSessions("deno permission model", sessions);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("ellipsises a long message into a bounded snippet", () => {
    const long = "alpha ".repeat(200) + "needle";
    const corpus: SearchableSession[] = [
      { id: "20260601-000000", title: "long", messages: [{ role: "user", content: long }] },
    ];
    const hits = searchSessions("needle", corpus, NOW);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet.length).toBeLessThanOrEqual(160);
    expect(hits[0]!.snippet.endsWith("…")).toBe(true);
  });
});
