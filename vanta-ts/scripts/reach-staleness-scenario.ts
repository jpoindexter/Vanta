// REACH-CHANNEL STALENESS SCENARIO (deterministic, fixture-based — no live X, no cookie).
// Drives the REAL searchTwitter() wiring against a stubbed fetch + a seeded STALE query id,
// asserting the two reliability outcomes the battery must guarantee for the staleness class
// (the bug class behind REACH-X-SEARCH-STALE-QID):
//   A. auto-heal + retry → a REAL parsed result (never a fake success, never a wedge)
//   B. heal can't refresh the id → a graceful, actionable fallback (bounded, no infinite retry)
// Run by scripts/reliability-reach-staleness.sh. Exit 0 = both outcomes hold; 1 = a regression.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchTwitter, saveQids } from "../src/reach/twitter.js";

const COOKIE = "auth_token=a; ct0=b";
type FetchStub = (url: string) => { ok: boolean; status: number; json: () => Promise<unknown> };

// A flat node with legacy.full_text is enough — parseTimeline walks the whole tree.
const oneTweet = {
  result: {
    rest_id: "123",
    core: { user_results: { result: { core: { screen_name: "jane" } } } },
    legacy: { full_text: "invoices by hand is painful", favorite_count: 7 },
  },
};

/** Run one scenario in an isolated VANTA_HOME with a stubbed global fetch. */
async function withStub<T>(
  stub: FetchStub,
  fn: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<{ value: T; fetchCalls: number }> {
  const home = mkdtempSync(join(tmpdir(), "vanta-reach-stale-"));
  const env = { ...process.env, VANTA_HOME: home, VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
  let fetchCalls = 0;
  const real = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    fetchCalls++;
    return Promise.resolve(stub(String(url)));
  }) as unknown as typeof fetch;
  try {
    return { value: await fn(env), fetchCalls };
  } finally {
    globalThis.fetch = real;
    rmSync(home, { recursive: true, force: true });
  }
}

const failures: string[] = [];
const check = (ok: boolean, msg: string): void => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures.push(msg);
};

// ── A. stale qid → heal refreshes it → retry returns a real result ──────────────
async function scenarioHealAndRetry(): Promise<void> {
  console.log("A. stale qid → auto-heal + retry → success");
  let healCalls = 0;
  const { value: r, fetchCalls } = await withStub(
    (url) => (url.includes("/STALE_SEARCH_ID/") ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => oneTweet }),
    async (env) => {
      saveQids({ SearchTimeline: "STALE_SEARCH_ID" }, env);
      const heal = async (_cookie: string | null, e: NodeJS.ProcessEnv): Promise<void> => {
        healCalls++;
        saveQids({ SearchTimeline: "FRESH_SEARCH_ID" }, e); // the channel re-scrapes a working id
      };
      return searchTwitter({ query: "invoices" }, COOKIE, env, heal);
    },
  );
  check(healCalls === 1, `heal ran exactly once (got ${healCalls})`);
  check(fetchCalls === 2, `fetched twice: 404 on stale, retry on fresh (got ${fetchCalls})`);
  check(r.ok === true, "returned ok (healed + retried, not a wedge)");
  check(r.ok === true && r.posts.length >= 1 && r.posts[0]?.handle === "jane", "returned a REAL parsed post — not a fake success");
}

// ── B. stale qid → heal can't refresh it → graceful, actionable fallback ─────────
async function scenarioGracefulDegrade(): Promise<void> {
  console.log("B. stale qid → heal can't refresh → graceful fallback (no retry, no wedge)");
  let healCalls = 0;
  const { value: r, fetchCalls } = await withStub(
    () => ({ ok: false, status: 404, json: async () => ({}) }), // 404 no matter the id
    async (env) => {
      saveQids({ SearchTimeline: "STALE_SEARCH_ID" }, env);
      const heal = async (): Promise<void> => { healCalls++; }; // runs, but the id stays stale
      return searchTwitter({ query: "x" }, COOKIE, env, heal);
    },
  );
  check(healCalls === 1, `heal was attempted once (got ${healCalls})`);
  check(fetchCalls === 1, `did NOT retry on an unchanged id — bounded, no infinite loop (got ${fetchCalls} fetch)`);
  check(r.ok === false, "reported failure honestly — not a fake success");
  check(r.ok === false && /site:x\.com/.test(r.error), "fallback is ACTIONABLE (points at web_search site:x.com)");
  check(r.ok === false && /cookie/i.test(r.error), "fallback names the cookie-reimport remedy");
}

async function main(): Promise<void> {
  console.log("── reach-channel staleness scenario (fixture-based, no live X) ──");
  try {
    await scenarioHealAndRetry();
    await scenarioGracefulDegrade();
  } catch (err) {
    // An unhandled throw IS the wedge class this scenario exists to catch.
    console.log(`  ✗ scenario threw (a wedge, not a graceful path): ${(err as Error).message}`);
    failures.push("scenario threw");
  }
  console.log("────────────────────────────────────────────────────────────────");
  if (failures.length === 0) {
    console.log("VERDICT: PASS — staleness auto-heals + retries, else degrades gracefully; never wedges, never fakes success");
    process.exit(0);
  }
  console.log(`VERDICT: FAIL — ${failures.length} assertion(s) broke:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}

void main();
