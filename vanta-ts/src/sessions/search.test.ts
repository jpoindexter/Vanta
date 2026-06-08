import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSession } from "./store.js";
import { searchSessions, formatSearchResults } from "./search.js";
import type { Message } from "../types.js";

const MSGS: Message[] = [
  { role: "system", content: "you are vanta" },
  { role: "user", content: "how do I configure rust toolchain?" },
  { role: "assistant", content: "Use rustup to manage your Rust toolchain installations." },
];

describe("searchSessions", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-search-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home });

  it("returns [] for an empty sessions dir", async () => {
    const results = await searchSessions("rust", env());
    expect(results).toEqual([]);
  });

  it("returns [] for empty query", async () => {
    await saveSession("20260101-000000", MSGS, { env: env() });
    const results = await searchSessions("", env());
    expect(results).toEqual([]);
  });

  it("finds a match in a session", async () => {
    await saveSession("20260101-000000", MSGS, { env: env() });
    const results = await searchSessions("rust", env());
    expect(results.length).toBeGreaterThan(0);
    // Both user and assistant messages contain "rust"
    const ids = results.map((r) => r.sessionId);
    expect(ids).toContain("20260101-000000");
  });

  it("match role is user or assistant (never system or tool)", async () => {
    await saveSession("20260101-000001", MSGS, { env: env() });
    const results = await searchSessions("vanta", env());
    // "you are vanta" is in the system message — should not appear
    expect(results).toEqual([]);
  });

  it("snippet is ≤ 120 chars (including ellipsis)", async () => {
    const long = "x".repeat(50) + "needle" + "x".repeat(50);
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: long },
    ];
    await saveSession("20260101-000002", msgs, { env: env() });
    const results = await searchSessions("needle", env());
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.snippet.length).toBeLessThanOrEqual(120);
    }
  });

  it("search is case-insensitive", async () => {
    await saveSession("20260101-000003", MSGS, { env: env() });
    const results = await searchSessions("RUST", env());
    expect(results.length).toBeGreaterThan(0);
  });

  it("respects maxResults", async () => {
    // Save 3 sessions each with the same keyword
    for (let i = 0; i < 3; i++) {
      await saveSession(`2026010${i + 1}-000000`, MSGS, { env: env() });
    }
    const results = await searchSessions("rust", env(), { maxResults: 1 });
    expect(results.length).toBe(1);
  });
});

describe("formatSearchResults", () => {
  it("returns a no-results message when matches is empty", () => {
    const out = formatSearchResults([], "foo");
    expect(out.toLowerCase()).toContain("no results");
  });

  it("includes the sessionId in output for non-empty results", () => {
    const matches = [
      {
        sessionId: "20260601-120000",
        turnIndex: 1,
        role: "user" as const,
        snippet: "hello rust world",
      },
    ];
    const out = formatSearchResults(matches, "rust");
    expect(out).toContain("20260601-120000");
    expect(out).toContain("rust");
  });
});
