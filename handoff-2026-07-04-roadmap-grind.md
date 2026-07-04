# Handoff — Vanta roadmap grind (hill-climb: clear all cards)

Generated: 2026-07-04
Project: Vanta — `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`
Branch: `main` (repo convention: roadmap grinds commit direct-to-main and push)
Loop: `/hill-climb clear all cards on roadmap` — target = horizon cards → 0. State: `.vanta/hill-climb-roadmap.json`.

## Progress this session
Horizon **147 → 144** (3 cards shipped, each a complete verified slice → co-located tests → typecheck → size gate → mark shipped → commit + push). Full suite **1001 files / 11335 passed / 3 skipped / 0 failed** @ `87a74989`.

1. **HARNESS-CRON-SCALE-ZERO** (`239bc48d`) — store-CAS + reconcile for the cron ledger. `schedule/cron-cas.ts` `claimFire()` = atomic O_EXCL per-`(taskId,windowKey)` claim (cross-PROCESS at-most-once — closes the double-run race the in-process `at-most-once.ts` map can't: gateway tick + manual `vanta cron run`, or a launchd double-invoke). Fails soft toward firing on non-EEXIST io error. `sweepClaims()` prunes old windows. `at-most-once.ts` pure `reconcileWindow()` (desired-vs-armed). Optional `claim` dep in `runner.ts`, wired into `schedule/commands.ts` + `gateway/run.ts`. Hosted one-shot machinery correctly out of scope.
2. **ASI-CHECKPOINT-RESTORE** (`2ea7c92f`) — `/restore <name|id> [branch]`. Was in-memory LIFO only (`/rollback` popped). Added `CheckpointStore.find()` (non-destructive by id/label) + a restore handler (restore-in-place, or `branch` forks a NEW persisted session via injected `saveSession`/`newSessionId`). Wired into `interactive-repl.ts` dispatch; cataloged `/checkpoint`+`/restore`. BOUNDARY (noted in card): snapshots CONVERSATION state (messages+turnIndex); brain/goals persist via their own stores, not bundled.
3. **OP-REDACT-STRUCTURAL** (`87a74989`) — `store/redact-structural.ts` positional secret redaction (URL query creds / auth headers / conn-string passwords) complementing `secret-scan.ts`'s vendor-value redaction. `redactForLog()` composes both, wired at emit time in `safety-client.ts logEvent()` so secrets never persist to `events.jsonl`.

## How the grind works (conventions — don't re-derive)
- Next card: walk `node scripts/build-order.mjs` (writes `~/Desktop/vanta-build-order-agent-readable.md`), SKIP cards needing live infra / real API keys / hardware / human decisions / entangled-multi-caller rewrites. Pick the next CLEAN self-contained, deterministically-verifiable, low-blast card.
- Per card: read its `done` in `roadmap.json` (top key `items`); smallest complete slice + co-located vitest tests; if already-implemented → the slice is a locking test, don't fabricate.
- Verify: run TS suite + size gate **from `vanta-ts/`** (never repo root — scans reference repos). Size gate: `node --import tsx src/cli.ts lint <files>` (NOT `src/lint/run.ts`). Limits file≤300/fn≤50/params≤4/cx≤10, no exemptions.
- Mark shipped: edit ONLY `status`/`updated`/`notes` lines, then `python3 -c "import json;json.load(open('roadmap.json'))"` before commit (JSON footgun). Note convention: prepend "Shipped YYYY-MM-DD.".
- Commit trailers required: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01UbJpVHNuN9o1FmS5YBbrzR`. gitleaks pre-commit runs. Run full suite periodically (did after each card 2 & 3).
- cwd drift: `cd <repo-root> && …` for git/roadmap; `cd <repo-root>/vanta-ts && …` for tests/typecheck/lint. Prefix each Bash call (a `cd` inside `&&` doesn't reliably persist here).

## Deferred (NOT skipped — need a decision or a plan, don't autonomously force)
- **PAPER-GOVERNANCE-AUDIT** (017) — `done` wants "every gated action + verdict + resolution", but the kernel only persists **Ask**-tier actions (`approvals.tsv`). Allow/Block have no structured ledger → needs structured per-verdict logging first (kernel or TS gate) before a complete governance export. `cli/audit.ts` is DEP-AUDIT (npm/cargo), unrelated.
- **PCLIP-ENFORCED-OUTCOMES** (024) — entangled with the existing `COFOUNDER-ENFORCED-OUTCOME` gate + `OutcomeContract` (`cofounder/outcome-contract.ts`). Making EVERY task-close require a typed outcome changes `advanceTask`'s contract across all fleet/team callers = blast-radius ≥2. Needs a plan on how the new typed outcome relates to the existing pre-close contract.

## Good clean next candidates (from a partial scan — verify each's `done` + footprint)
- **OP-MODEL-PRESETS** (054) — per-model effort/fast preset memory. No existing impl; a small `~/.vanta` store + pure apply/remember + persistence tests. MODERATE blast: re-apply on model-select + update on `/effort` change touches both hosts (REPL `model-cmd`/`effort` + TUI `config-actions`). Scope the store+pure-logic+tests first, then wire.
- **OP-CHECKPOINT-ROLLBACK** (057) — confirm-or-build: does checkpoint/rewind offer turn-granular rollback via a non-git store? (I have context: `CheckpointStore` is in-memory turnIndex+messages; `rewind`/`globalFileCheckpointStore` is per-edit, neither touches user git.) Verify whether per-turn granularity is auto or manual-only + what `/undo` does before deciding confirm-and-lock vs build.
- **DECISION-CLASSIFIER** (044) — a classifier already exists (`repl/decision-classifier.ts`); card wants it wired into loop checkpoints with routing (user-challenge→operator, taste→batch). Integration-heavy.
- **MSG-TELEGRAM-ROBUST** (049) — 429 backoff-retry + forum-topic routing + link-preview suppression in the Telegram adapter; pure retry/routing logic is offline-testable.

## Continuation prompt
---
Continue the Vanta roadmap grind (hill-climb: clear all horizon cards → 0). Project `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta`, branch `main` (roadmap grinds commit direct-to-main and push — the convention). Read first: `./CLAUDE.md`, `vanta-ts/CLAUDE.md`, `.vanta/hill-climb-roadmap.json` (loop state, 3 wakes done, 144 horizon left), and this handoff. Full suite green @ `87a74989` (1001 files / 11335 pass).

Regenerate the queue: `node scripts/build-order.mjs`. Pick the next CLEAN self-contained, deterministically-verifiable, low-blast card (skip LIVE-infra/hardware/decision/entangled cards — see "Deferred" above). For each: read its `done` in `roadmap.json`; smallest complete slice + co-located vitest tests (already-implemented → a locking test, don't fabricate); typecheck + size gate from `vanta-ts/`; mark shipped (edit only status/updated/notes, then validate the JSON parses); commit with the required trailers + push; log the wake delta into `.vanta/hill-climb-roadmap.json`. Run the full suite periodically. Verify each slice by running the real path, not a proxy. Never weaken the Rust kernel boundary. Stop conditions: horizon = 0, or 3 consecutive wakes with zero delta.
---
