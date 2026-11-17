import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSession, setSessionTrashed } from "./store.js";
import { centredSnippet, MAX_HITS_PER_SESSION, searchSessionsForAgent, SNIPPET_CHARS } from "./agent-search.js";
import type { Message } from "../types.js";

const talk = (user: string, assistant: string): Message[] => [
  { role: "system", content: "you are vanta" },
  { role: "user", content: user },
  { role: "assistant", content: assistant },
];

describe("searchSessionsForAgent", () => {
  let home: string;
  let root: string;
  const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home });
  const search = (query: string, extra: { limit?: number; currentSessionId?: string } = {}) =>
    searchSessionsForAgent({ query, limit: extra.limit ?? 5, env: env(), root, currentSessionId: extra.currentSessionId });

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-agent-search-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-agent-search-root-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  it("finds a cited snippet from an earlier session", async () => {
    await saveSession("20260301-101500", talk("which database should we use?", "We decided on Postgres for the ledger."), { env: env(), now: "2026-03-01T10:15:00Z", title: "Database choice" });
    await saveSession("20260302-090000", talk("unrelated chat about lunch", "ok"), { env: env(), now: "2026-03-02T09:00:00Z" });
    const { hits, searched } = await search("postgres");
    expect(searched).toBe(2);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sessionId: "20260301-101500", date: "2026-03-01", title: "Database choice", turnIndex: 2, role: "assistant" });
    expect(hits[0]?.snippet).toContain("Postgres for the ledger");
  });

  it("returns no hits for an empty store and for a query nothing matches", async () => {
    expect((await search("postgres")).hits).toEqual([]);
    await saveSession("s1", talk("hello", "hi"), { env: env() });
    expect((await search("postgres")).hits).toEqual([]);
    expect((await search("   ")).hits).toEqual([]);
  });

  it("ranks the stronger session first and caps hits per session", async () => {
    await saveSession("weak", talk("we touched cache once", "cache"), { env: env(), now: "2026-03-03T00:00:00Z" });
    await saveSession("strong", talk("redis cache eviction policy", "redis cache eviction: use allkeys-lru. redis cache eviction matters."), { env: env(), now: "2026-03-01T00:00:00Z" });
    const { hits } = await search("redis cache eviction");
    expect(hits[0]?.sessionId).toBe("strong");
    expect(hits.filter((h) => h.sessionId === "strong")).toHaveLength(MAX_HITS_PER_SESSION);
    expect(hits.map((h) => h.sessionId)).toContain("weak");
  });

  it("honors the limit", async () => {
    for (let i = 0; i < 4; i++) await saveSession(`s${i}`, talk("deploy notes", "deploy done"), { env: env(), now: `2026-03-0${i + 1}T00:00:00Z` });
    expect((await search("deploy", { limit: 2 })).hits).toHaveLength(2);
  });

  it("excludes the current session, trashed sessions and sessions from another project, keeps legacy ones", async () => {
    await saveSession("current", talk("zebra plan", "zebra"), { env: env() });
    await saveSession("trashed", talk("zebra plan", "zebra"), { env: env() });
    await setSessionTrashed("trashed", true, env());
    await saveSession("elsewhere", talk("zebra plan", "zebra"), { env: env(), cwd: join(tmpdir(), "some-other-project") });
    await saveSession("here", talk("zebra plan", "zebra"), { env: env(), cwd: root });
    await saveSession("legacy", talk("zebra plan", "zebra"), { env: env() });
    const ids = [...new Set((await search("zebra", { currentSessionId: "current" })).hits.map((h) => h.sessionId))].sort();
    expect(ids).toEqual(["here", "legacy"]);
  });

  it("skips a corrupt neighbour instead of failing", async () => {
    await saveSession("good", talk("kiwi", "kiwi"), { env: env() });
    await writeFile(join(home, "sessions", "bad.json"), "{broken", "utf8");
    expect([...new Set((await search("kiwi")).hits.map((h) => h.sessionId))]).toEqual(["good"]);
  });

  it("never echoes secret-looking strings from stored sessions", async () => {
    const pat = `ghp_${"a1B2".repeat(9)}`;
    const text = `deploy token is ${pat} and curl 'https://x.test/api?token=opaqueValue123&v=1' with Bearer abcdefghijklmnopqrstuvwxyz0123456789`;
    await saveSession("leaky", talk("deploy credentials?", text), { env: env(), title: `Deploy ${pat}` });
    const { hits } = await search("deploy token");
    const blob = JSON.stringify(hits);
    expect(blob).not.toContain(pat);
    expect(blob).not.toContain("opaqueValue123");
    expect(blob).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(blob).toContain("[REDACTED]");
  });
});

describe("centredSnippet", () => {
  it("cuts a bounded window around a match deep in a long message", () => {
    const text = `${"filler ".repeat(300)}the needle decision is here ${"tail ".repeat(300)}`;
    const snippet = centredSnippet(text, "needle decision");
    expect(snippet).toContain("needle decision");
    expect(snippet.length).toBeLessThanOrEqual(SNIPPET_CHARS + 2);
    expect(snippet.startsWith("…") && snippet.endsWith("…")).toBe(true);
  });

  it("redacts before cutting so a secret on the window edge is not half-shown", () => {
    const pat = `ghp_${"z9Y8".repeat(9)}`;
    // The token starts inside the 240-char window and ends outside it.
    const text = `${"x".repeat(60)}needle ${"y ".repeat(80)}${pat}`;
    const snippet = centredSnippet(text, "needle");
    expect(snippet).toContain("[REDACTED]");
    expect(snippet).not.toMatch(/ghp_|z9Y8/);
  });
});
