# Handoff — Vanta Hermes/OpenClaw-readiness grind
Generated: 2026-07-03 (session 2 of the day)
Project: Vanta — `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`
Branch: `main` (repo convention: roadmap grinds commit direct-to-main and push)

## What Was Accomplished
4 roadmap cards shipped, each: smallest complete slice → co-located tests → typecheck → size gate → mark `shipped` in roadmap.json → commit (with trailers) → push. Full suite run after every card that touched a shared module. Final full suite: **998 files / 11295 passed / 3 skipped / 0 failed.**

| Card | Tier/Track | Commit | What shipped |
|------|-----------|--------|--------------|
| **GATEWAY-CHANNEL-SELFHEAL** | rock/M · Operator | `88243328` | `gateway/platforms/channel-supervisor.ts` — `SupervisedChannel` wraps each child adapter: failed poll → down + exponential-backoff reconnect (1s→60s) checked in `poll()` on the tick loop (clock-injected). `MultiChannelAdapter.health()`; `run.ts` diffs health each tick + logs up/down transitions. |
| **CROSS-AGENT-MEMORY-UNIFY** | rock/M · Operator | `778db729` | `vanta migrate memory <claude-code\|codex> [path]` — imports another agent's memory store into the brain, deduped (keyed on `entryId`) + provenance-tagged (`sourceType:external`, `sourceRef`). `migrate/memory.ts` pure parse/plan/ingest; `cli/migrate-memory-cmd.ts` wires the live boundary via the **Brain port** (`resolveBrain`). Live-verified: 178 facts from real `~/.claude/CLAUDE.md`. |
| **REACH-QQ-WECHAT** | pebble/M · Operator | `a2cced17` | QQ 官方机器人 v2 + WeChat 公众号 adapters (`qq.ts`/`qq-parse.ts`, `wechat.ts`/`wechat-parse.ts`) — injected-transport + webhook-buffer pattern. QQ tracks last inbound `msg_id` per group → passive reply (`msg_seq` per part). WeChat parses flat-CDATA XML dependency-free. → **22 adapters**. |
| **CODE-INTEL-FACTORY-WIRING** | pebble/S · Operator | `774922e5` | Factory builds with a code map (planner `augmentPlanWithCodeIntel`) + verify fast-fails on affected tests (`affectedTestsCheck` before `fullSuiteCheck`). Additive+guarded through the CodeIntel **port**; absent → identical behavior. Does NOT weaken the full-suite floor (affected ⊆ full). |

## Current State
- Build: typecheck clean, size gate clean throughout (file ≤300/fn ≤50/params ≤4/cx ≤10, no exemptions).
- Tests: full suite **998 files / 11295 pass / 3 skip (live-gated voice/LoRA) / 0 fail**.
- Tree clean. Only untracked: `demo-autonomous-box.gif` + this + the prior handoff (all intentional). Everything else committed + pushed to `origin/main` (`b635d619..774922e5`).
- Root `CLAUDE.md` bumped 20→22 messaging adapters.

## In Progress
None — every started card finished, verified, pushed. Clean stopping point.

## Blocked / Needs Jason's Decision (do NOT autonomously build)
- **Web-extract cluster** — `WEB-EXTRACT-PIPELINE`, `WEB-EXTRACT-AUX-MODEL`, `WEB-BACKEND-SPLIT` presume a `web_extract`/extract-backend concept that doesn't exist yet (Vanta has `web_fetch`). Design the extract-backend first.
- **WEB-BACKEND-XAI-GROK** — Grok live-search returns a *cited answer*, not titled results; needs a mapping design (the `SearchProvider` mapper skips title-less results).
- **HARNESS-CRON-SCRIPT-MODE** — a `no_agent` raw-exec cron mode would bypass the kernel gate; safety-boundary call.
- **TUI-DELIGHT-PASS** — subjective design/"signature moment" pass; hard to verify objectively, scope-creep risk.
- **RUN-ANYWHERE-TERMUX / SURFACE-MOBILE-APP** — can't verify Done without an Android device / mobile build.

## Recommended Next Candidates (objectively verifiable, buildable offline)
Ranked smallest-first (nd-choicereduce):
1. **PCLIP-ENFORCED-OUTCOMES** (pebble/M, Harness) — a task cannot close without a typed outcome object; `done` requires the outcome present. Self-contained, unit-testable.
2. **ASI-CHECKPOINT-RESTORE** (pebble/M, Harness) — `/checkpoint <name>` snapshots full state; `/restore` returns/branches. Builds on the `SessionStore` port (shipped last session).
3. **BRAIN-ENTITY-SIGNAL** (rock/M, Operator) — mem0's 3rd retrieval signal (entity-match + IDF down-weight). MEASURABLE via `vanta eval mem public` (LongMemEval/LoCoMo recall must improve, else drop) — but needs the eval dataset + an LLM for extraction, so verification is heavier.
- Bigger Hermes rocks if Jason wants max value/card: **INTENT-SPEC-RECOVERY** (L/high — reverse-engineer spec from code + drift detection, testable on a fixture repo), **USER-MODEL-DIALECTIC** (L).

## Key Decisions Made (and Why)
1. **Interpreted "Hermes/OpenClaw readiness" as: prioritize cards that close a named competitor gap, but STRATEGY.md defines the readiness *bar* as Pillar-1 Harness reliability, not feature parity.** Shipped 3 direct competitor-gap cards + 1 Harness card. When the clean competitor pebbles ran out, flagged the fork rather than silently grinding rocks.
2. **CODE-INTEL affected-tests check is an ADDITIVE fast-fail pre-gate, NOT a replacement for the full suite.** The factory auto-commits/pushes; narrowing verify to affected-only would let regressions through. Because affected tests ⊆ the full suite, the pre-gate can only fast-fail a slice `fullSuiteCheck` would also fail — never weakens the trust gate. This is a deliberate (safer) reading of "scope verify to affected tests."
3. **QQ inbound wire-shape is the botpy/QQ-v2 convention (documented assumption + tolerant parser), not a doc I could echo verbatim.** QQ send + WeChat XML/send ARE doc-confirmed. Live-gated like the other 19 adapters — same bar. Budgeted ~5 web calls for API verification, then decided (anti-yak-shave).
4. **Cross-agent memory writes go through the Brain PORT (`resolveBrain`), never the concrete `brain/brain.js`** — the `brain-variant-port` architecture boundary. `brain/entries.js` (loadEntries/entryId) is fine.

## Context That's Easy to Lose (gotchas that bit this session)
- **cwd drifts across Bash calls.** Git/roadmap.json work happens at repo root; tests/lint/CLI run from `vanta-ts/`. Always `cd /Users/jasonpoindexter/Documents/GitHub/docs/Vanta/vanta-ts && ...` for the TS side, and run `git`/`python3 roadmap.json` from repo root. Confirm `pwd` when unsure.
- **Run the CLI/lint with `npx tsx src/cli.ts …` from `vanta-ts/`.** `node --import tsx …` fails from repo root (tsx is in `vanta-ts/node_modules`). Size gate: `npx tsx src/cli.ts lint <files>` (NOT `src/lint/run.ts <paths>` — that no-ops on explicit paths).
- **The FULL suite catches cross-module breaks targeted tests miss** — architecture boundaries (`architecture.test.ts`) and pinned-list assertions. This session it caught: the `brain-variant-port` violation (card 2) and 3 pinned-list assertions (adapter list in `factory.test.ts`, verify-chain order in `verifier.test.ts`). Run the full suite after touching any shared module (brain, registry, factory).
- **Adding a messaging adapter = 4 edits:** the adapter file(s) + `adapter-registry.ts` entry + `factory.test.ts` `implementedPlatformIds` list + `registry.ts` `MESSAGING_CATALOG` entry (for `vanta setup messaging`).
- **Adding a factory `VerifyCheck` = update the order assertion** in `verifier.test.ts` ("registers checks in a stable order").
- **`roadmap.json`:** edit ONLY `status`/`updated`/`notes` field lines; a card may have NO `notes` field (add it, watch the trailing comma before `}`). Validate with `python3 -c "import json;json.load(open('roadmap.json'))"` after EVERY edit. Shipped-note convention: prepend `"Shipped YYYY-MM-DD. …"`, bump `updated`. Top-level key is `items`.
- **Factory files are kernel-protected** (autonomous writes blocked); interactive edits are fine. NEVER alter `verifier.ts:checkNoProtectedPaths` (byte-mirrors `src/safety.rs:is_protected_path`).
- **Commit trailers required:** `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01UbJpVHNuN9o1FmS5YBbrzR`. gitleaks pre-commit runs on every commit.

## Continuation Prompt
---
Continue the Vanta roadmap grind toward Hermes/OpenClaw readiness. Project: `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`, branch `main` (this repo commits roadmap grinds direct-to-main and pushes — that's the convention). Push to git after each card.

Read first: `./CLAUDE.md`, `vanta-ts/CLAUDE.md`, `STRATEGY.md`, and this handoff. Prior session (this one) shipped 4 cards: GATEWAY-CHANNEL-SELFHEAL, CROSS-AGENT-MEMORY-UNIFY, REACH-QQ-WECHAT, CODE-INTEL-FACTORY-WIRING — all pushed, full suite green (998 files/11295 pass).

Framing: "Hermes/OpenClaw readiness" = close named competitor gaps, but STRATEGY defines the readiness *bar* as Pillar-1 Harness reliability. The clean competitor-parity pebbles are exhausted; what remains is Harness pebbles + bigger rocks. Start with **PCLIP-ENFORCED-OUTCOMES** or **ASI-CHECKPOINT-RESTORE** (clean, objectively verifiable) unless Jason steers to a Hermes rock.

For each card: read its `done` in `roadmap.json` (key `items`); implement the smallest complete slice with co-located vitest tests; if already-implemented, the slice is a locking test — don't fabricate a build. Typecheck, size-gate, mark `shipped` (edit ONLY status/updated/notes; validate the JSON parses), commit with the trailers, push. VERIFY the real Done path, not a proxy.

Constraints: run the TS suite + size gate from `vanta-ts/` (never repo root — it scans reference repos); confirm `pwd` (cwd drifts). Size limits file≤300/fn≤50/params≤4/cx≤10, no exemptions. Run the FULL suite after touching a shared module (brain/registry/factory) — it catches architecture-boundary + pinned-list breaks targeted tests miss. Non-brain code imports the Brain PORT (`resolveBrain`), never `brain/brain.js`. Never weaken the Rust kernel safety boundary or `verifier.ts:checkNoProtectedPaths`. VERIFY external API shapes via WebFetch before coding a provider (budget ~5 web calls then decide).

SKIP (need Jason's decision): the web-extract cards (WEB-EXTRACT-PIPELINE/AUX-MODEL, WEB-BACKEND-SPLIT — presume a web_extract concept that doesn't exist), WEB-BACKEND-XAI-GROK (cited-answer mapping), HARNESS-CRON-SCRIPT-MODE (kernel-bypass), TUI-DELIGHT-PASS (subjective), RUN-ANYWHERE-TERMUX/SURFACE-MOBILE-APP (unverifiable without a device).
---
