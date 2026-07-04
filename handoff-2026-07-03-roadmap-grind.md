# Handoff — Vanta roadmap grind (Harness/search cards)
Generated: 2026-07-03 15:45
Project: Vanta — `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`
Branch: `main` (repo convention: roadmap grinds commit direct-to-main and push; history confirms)

## What Was Accomplished
8 roadmap cards shipped + 1 chore, each: smallest complete slice → tests → typecheck → size gate → roadmap status `shipped` → commit → push. Full vitest suite run mid-session: **990 files / 11236 passed, 3 skipped, 0 failed**.

- **RELIABILITY-HARNESS-REACH-STALENESS** — deterministic stale-qid battery scenario (`scripts/reliability-reach-staleness.sh` + `vanta-ts/scripts/reach-staleness-scenario.ts`) driving the real `searchTwitter()` wiring vs a stubbed fetch; asserts heal+retry OR graceful degrade, no wedge/fake.
- **SANDBOX-SERVE-FASTFAIL** — `shell-cmd.ts` `sandboxServeRefusal()` fast-fails a serve/listen intent under an active sandbox before the background↔foreground refusal ping-pong; `shell-background-detect.ts` gained `looksLikeServeIntent`.
- **PORT-PROMPT-TIERS** — extracted `assembleTiers(tiers, ctx)`; locked the registry contract with tests.
- **PORT-SESSION-STORE** — `SessionStore` interface + `createFsSessionStore` default adapter; free fns became delegators; in-memory-adapter test proves the seam.
- **WEB-DOMAIN-SCOPING** — `web_search` `allowed_domains`/`excluded_domains`; `search/scope.ts` (validate + `scopeQuery` site: rewrite); `SearchProvider.filtersDomains` capability + `searchAcross()` router.
- **WEB-SEARCH-CATEGORY-PAGINATION** — `category`/`page` params; SearXNG honors them via pure `buildSearxngUrl`.
- **WEB-BACKEND-EXA** — `search/exa.ts` (verified API; native `includeDomains`/`excludeDomains` → first real `filtersDomains:true`).
- **WEB-BACKENDS-MANAGED** — `search/{firecrawl,tavily,parallel}.ts` against verified APIs; auto-detect priority Firecrawl→Parallel→Tavily→Exa; `resolveNamedProvider` refactored to a `KEYED` data table.
- **chore** — de-hardcoded `scripts/reliability-eval-cron.sh` (self-locating REPO via `${BASH_SOURCE}`, glob newest nvm node, `$HOME`-relative bin dirs).

## Files Changed
All committed + pushed (commits `e418c441`..`b635d619`). Net-new: `search/{scope,exa,firecrawl,tavily,parallel}.ts` (+tests), `scripts/reliability-reach-staleness.sh`, `vanta-ts/scripts/reach-staleness-scenario.ts`. Modified: `search/{interface,index,searxng}.ts`, `tools/web-search.ts`, `tools/{shell-cmd,shell-background-detect}.ts`, `prompt.ts`, `sessions/store.ts`, `.env.example`, `roadmap.json`, `CLAUDE.md` ×2 (+ co-located tests for each).

## Current State
- Build: typecheck clean, size gate clean throughout.
- Tests: full suite **11236 pass / 3 skip (live-gated voice/LoRA) / 0 fail**.
- Uncommitted: only `demo-autonomous-box.gif` (untracked, intentional — a demo asset, no path issue; commit if/when wanted).
- Everything else committed + pushed to `origin/main`.

## In Progress
None — every started card was finished, verified, and pushed. Clean stopping point.

## Blocked / Needs Decision (do NOT autonomously build these)
- **HARNESS-CRON-SCRIPT-MODE** (pebble/M) — a `no_agent` raw-exec cron mode bypasses the kernel gate. Decision: gate the script exec through `assess()`, treat as trusted user-crontab, or something else? Safety-boundary call.
- **WEB-BACKEND-XAI-GROK** (pebble/M) — xAI live-search returns a *cited answer*, not titled results; forcing into `SearchProvider` yields thin url-only results (our mapper skips title-less). Needs a mapping design (fetch titles? different tool?).
- **WEB-BACKEND-SPLIT** (sand/S) + **WEB-EXTRACT-PIPELINE/AUX-MODEL** — presume a `web_extract` / extract-backend concept that doesn't exist yet (Vanta has `web_fetch`). Design the extract-backend first; then split is trivial.

## Key Decisions Made (and Why)
1. **Left the pre-existing eval-cron infra for the user initially, then committed it after de-hardcoding** — the only blocker was a hardcoded `/…/_active/Vanta` path in a public repo; once self-locating, it was safe to land.
2. **Mark-shipped edits touch ONLY `status`/`updated`/`notes` field lines** — an early edit replaced across a card's closing `},` and broke `roadmap.json` twice. Always `python3 -c "import json;json.load(open('roadmap.json'))"` after editing it, before commit.
3. **Verified every external API shape via WebFetch before coding** (Exa, Tavily, Firecrawl, Parallel) — mocked tests against a fabricated shape prove nothing (si-feedback-integrity). Parallel had a beta-header ambiguity, noted in code; it degrades gracefully (throws→tool tries next provider).
4. **`filtersDomains` capability on `SearchProvider`** — providers that filter domains natively get the raw query + scope in config; others get a `site:`/`-site:` query rewrite via `searchAcross()`. Both paths tested.

## Exact Next Steps (in order)
1. [ ] `/clear` and start fresh (this thread is long).
2. [ ] `cd /Users/jasonpoindexter/Documents/GitHub/docs/Vanta && node scripts/build-order.mjs` → regenerate the ordered queue (151 open).
3. [ ] Pick the next buildable **pebble Harness** cards, skipping the 3 deferred above. Objectively-verifiable, self-contained candidates: `CODE-INTEL-FACTORY-WIRING` (Operator/S/low, additive/no-op), `PCLIP-ENFORCED-OUTCOMES` (typed task outcome), `ASI-CHECKPOINT-RESTORE` (session snapshot, builds on the new `SessionStore`).
4. [ ] For each: read the card's `done` in `roadmap.json`; if it's already implemented (like PORT-PROMPT-TIERS was), the slice is a locking test + mark shipped — don't fabricate a build.
5. [ ] Commit + push each slice; run the full suite periodically.

## Context That's Easy to Lose
- **Run the TS suite from `vanta-ts/`, never the repo root** (root config scans bundled `reference/` repos → spurious failures). `cd` persists across Bash calls — the working dir drifts between repo-root (for `git`/`roadmap.json`) and `vanta-ts/` (for tests). Always confirm `pwd`.
- **Size gate:** verify with `node --import tsx src/cli.ts lint <files>` from `vanta-ts/`, NOT `src/lint/run.ts <paths>` (the latter no-ops on explicit paths). Limits: file ≤300, fn ≤50, params ≤4, cx ≤10, **no exemptions**. When a switch/function trips cx, a data-table refactor is the clean fix (see `search/index.ts` `KEYED`).
- **`roadmap.json`** top-level key is `items` (not `cards`); 1116 cards. Status vocab: `shipped`/`horizon`/`next`/`parked`. Shipped note convention: prepend `"Shipped YYYY-MM-DD. …"`, bump `updated`.
- **Commit trailers required** (from Claude Code harness): `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01UbJpVHNuN9o1FmS5YBbrzR`.
- **gitleaks pre-commit** runs on every commit; fake test creds like `auth_token=a; ct0=b` are already allowlisted.
- A **session-scoped Stop hook** is active with condition "continue executing on roadmap items in order, push to git then stop" — it auto-clears when satisfied; a fresh thread won't carry it.

## Continuation Prompt
---
Continue the Vanta roadmap grind. Project: `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`, branch `main` (this repo commits roadmap grinds direct-to-main and pushes — that's the convention).

Read first: `./CLAUDE.md`, `vanta-ts/CLAUDE.md`, and the last handoff `handoff-2026-07-03-roadmap-grind.md`. Prior session shipped 8 cards (2 reliability + 2 architecture ports + 4 web-search-backend cards); all pushed, full suite green (11236 pass/0 fail).

Task: keep knocking out roadmap cards in build order. Regenerate the queue with `node scripts/build-order.mjs` (151 open). For each card: read its `done` criterion in `roadmap.json` (top-level key `items`); implement the smallest complete slice with co-located vitest tests; if the card turns out already-implemented, the slice is a locking test — don't fabricate a build. Then typecheck, size-gate, mark the card `shipped` (edit ONLY `status`/`updated`/`notes` field lines, then validate the JSON parses), commit with the required trailers, and push. Verify each slice by running the real path, not a proxy.

Constraints: run the TS suite + size gate from `vanta-ts/` (never repo root — it scans reference repos). Size limits file≤300/fn≤50/params≤4/cx≤10, no exemptions; a data-table refactor fixes a cx-tripping switch. VERIFY any external API shape via WebFetch before coding a provider (mocked tests against a guessed shape prove nothing). Never weaken the Rust kernel safety boundary.

SKIP these (they need Jason's decision, not autonomous work): HARNESS-CRON-SCRIPT-MODE (no_agent raw-exec bypasses the kernel gate), WEB-BACKEND-XAI-GROK (Grok returns a cited answer, not titled results — needs a mapping design), WEB-BACKEND-SPLIT + WEB-EXTRACT-* (presume a web_extract/extract-backend concept that doesn't exist yet). Good next candidates: CODE-INTEL-FACTORY-WIRING, PCLIP-ENFORCED-OUTCOMES, ASI-CHECKPOINT-RESTORE (builds on the new SessionStore port).
---
