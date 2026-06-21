import { describe, it, expect, vi } from "vitest";
import {
  parsePrArg,
  matchSessionsToBranch,
  resolveSessionForPr,
  formatNoSessionForPr,
  defaultSessionBranch,
  type ResolvePrDeps,
} from "./from-pr.js";
import type { SessionMeta } from "./store.js";

/** Build a SessionMeta with a title (the documented branch proxy) + updated time. */
function meta(id: string, title: string, updated: string): SessionMeta {
  return { id, title, started: updated, updated, turns: 1 };
}

describe("parsePrArg", () => {
  it("parses a bare number to its PR number", () => {
    expect(parsePrArg("12")).toEqual({ number: 12 });
  });

  it("trims surrounding whitespace on a bare number", () => {
    expect(parsePrArg("  7 ")).toEqual({ number: 7 });
  });

  it("accepts a leading '#' on a bare number", () => {
    expect(parsePrArg("#42")).toEqual({ number: 42 });
  });

  it("parses a GitHub PR URL to its PR number", () => {
    expect(parsePrArg("https://github.com/theft-studio/vanta/pull/12")).toEqual({
      number: 12,
    });
  });

  it("parses a PR URL with trailing path/segments", () => {
    expect(parsePrArg("https://github.com/o/r/pull/305/files")).toEqual({ number: 305 });
  });

  it("returns null for an empty / whitespace string", () => {
    expect(parsePrArg("")).toBeNull();
    expect(parsePrArg("   ")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(parsePrArg("abc")).toBeNull();
    expect(parsePrArg("12abc")).toBeNull();
  });

  it("returns null for a negative number", () => {
    expect(parsePrArg("-5")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parsePrArg("0")).toBeNull();
  });

  it("returns null for a non-PR URL (issue URL, no /pull/<n>)", () => {
    expect(parsePrArg("https://github.com/o/r/issues/12")).toBeNull();
  });

  it("returns null for a non-http URL scheme", () => {
    expect(parsePrArg("ftp://example.com/pull/9")).toBeNull();
  });
});

describe("matchSessionsToBranch", () => {
  const sessions: SessionMeta[] = [
    meta("20260620-090000", "feat/login", "2026-06-20T09:00:00Z"),
    meta("20260620-120000", "feat/login", "2026-06-20T12:00:00Z"),
    meta("20260620-110000", "fix/typo", "2026-06-20T11:00:00Z"),
  ];

  it("returns sessions whose title matches the branch, newest-first", () => {
    const out = matchSessionsToBranch(sessions, "feat/login");
    expect(out.map((s) => s.id)).toEqual(["20260620-120000", "20260620-090000"]);
  });

  it("preserves the input newest-first ordering for the matches", () => {
    // sessions arg is already newest-first (as listSessions yields); first = newest.
    const out = matchSessionsToBranch(sessions, "feat/login");
    expect(out[0]?.id).toBe("20260620-120000");
  });

  it("matches case-insensitively and ignoring stray whitespace", () => {
    const out = matchSessionsToBranch(sessions, "  FEAT/LOGIN  ");
    expect(out.map((s) => s.id)).toEqual(["20260620-120000", "20260620-090000"]);
  });

  it("returns [] when no session matches the branch", () => {
    expect(matchSessionsToBranch(sessions, "feat/nothing")).toEqual([]);
  });

  it("returns [] for a blank target branch", () => {
    expect(matchSessionsToBranch(sessions, "   ")).toEqual([]);
  });

  it("uses an injected branch accessor over the title default", () => {
    type Branched = SessionMeta & { branch: string };
    const branched: Branched[] = [
      { ...meta("a", "some title", "2026-06-20T01:00:00Z"), branch: "feat/x" },
      { ...meta("b", "other title", "2026-06-20T02:00:00Z"), branch: "feat/y" },
    ];
    const out = matchSessionsToBranch(branched, "feat/y", (s) => (s as Branched).branch);
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });

  it("defaultSessionBranch reads the title", () => {
    expect(defaultSessionBranch(meta("z", "feat/z", "2026-06-20T00:00:00Z"))).toBe("feat/z");
  });
});

describe("resolveSessionForPr", () => {
  const sessions: SessionMeta[] = [
    meta("20260620-090000", "feat/login", "2026-06-20T09:00:00Z"),
    meta("20260620-120000", "feat/login", "2026-06-20T12:00:00Z"),
    meta("20260620-110000", "fix/typo", "2026-06-20T11:00:00Z"),
  ];

  function deps(over: Partial<ResolvePrDeps> = {}): ResolvePrDeps {
    return {
      prNumber: 12,
      getPrBranch: async () => "feat/login",
      listSessions: async () => sessions,
      ...over,
    };
  }

  it("returns the newest matching session id for the PR's branch", async () => {
    await expect(resolveSessionForPr(deps())).resolves.toBe("20260620-120000");
  });

  it("passes the PR number through to getPrBranch", async () => {
    const getPrBranch = vi.fn(async () => "fix/typo");
    const id = await resolveSessionForPr(deps({ prNumber: 99, getPrBranch }));
    expect(getPrBranch).toHaveBeenCalledWith(99);
    expect(id).toBe("20260620-110000");
  });

  it("returns null when the PR has no matching session", async () => {
    await expect(
      resolveSessionForPr(deps({ getPrBranch: async () => "feat/unrelated" })),
    ).resolves.toBeNull();
  });

  it("returns null when getPrBranch yields null (PR not found)", async () => {
    await expect(resolveSessionForPr(deps({ getPrBranch: async () => null }))).resolves.toBeNull();
  });

  it("returns null when getPrBranch yields an empty/whitespace branch", async () => {
    await expect(resolveSessionForPr(deps({ getPrBranch: async () => "  " }))).resolves.toBeNull();
  });

  it("returns null (never throws) when getPrBranch rejects", async () => {
    await expect(
      resolveSessionForPr(deps({ getPrBranch: async () => { throw new Error("gh not authed"); } })),
    ).resolves.toBeNull();
  });

  it("does not list sessions when the PR branch can't be resolved", async () => {
    const listSessions = vi.fn(async () => sessions);
    await resolveSessionForPr(deps({ getPrBranch: async () => null, listSessions }));
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("returns null when there are no sessions at all", async () => {
    await expect(resolveSessionForPr(deps({ listSessions: async () => [] }))).resolves.toBeNull();
  });

  it("honors an injected branch accessor", async () => {
    type Branched = SessionMeta & { branch: string };
    const branched: Branched[] = [
      { ...meta("a", "title a", "2026-06-20T01:00:00Z"), branch: "feat/login" },
    ];
    const id = await resolveSessionForPr(
      deps({ listSessions: async () => branched, sessionBranch: (s) => (s as Branched).branch }),
    );
    expect(id).toBe("a");
  });
});

describe("formatNoSessionForPr", () => {
  it("names the PR number and invites a fresh start", () => {
    expect(formatNoSessionForPr(12)).toBe("no session for PR #12 — start fresh?");
  });
});
