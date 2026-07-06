# Handoff — Vanta roadmap grind (operator parity: Hermes/OpenClaw)

Generated: 2026-07-07
Project: `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta` · branch `main` (grind commits direct-to-main + push, required trailers below)
Goal (session Stop-hook): keep pushing through the roadmap in logical order toward Hermes/OpenClaw operator stats; everything green; no stubs; commit+push every slice.

## State
Horizon **125 → 111** (14 slices shipped 2026-07-06→07, every one: complete slice → co-located tests → real-path executed → tsc + size gate + FULL suite green → roadmap.json notes → commit+push). Last full verify: **1029 files / 11587 tests** @ `79b0e2fd`. Kernel untouched (67 tests).

## Shipped this session (details in roadmap.json notes per card)
1. PROACTIVE-CHANNEL-OUTREACH — `proactive/outreach*`, `vanta proactive silence`, VANTA_OUTREACH*
2. BRAIN-ENTITY-SIGNAL — `search/entities.ts`; MEASURED LoCoMo 32.4→34.9 recall@5 (blend 0.25; RRF peer-list fusion HURTS: →14.8)
3. HARNESS-CRON-SCRIPT-MODE — cron `mode: no_agent|script_context`, `schedule/script-run.ts`
4. PCLIP-APPROVAL-STAGES — `team/review-stage.ts`, done blocked until stages approved
5. VANTA-SELF-HOSTED — `vanta runner` (atomic-claim job queue + loop; live codex job proven)
6. MSG-TELEGRAM-ROBUST — 429 backoff, forum-topic threadId (generic Inbound/Outbound field), no link previews
7. PCLIP-ACTIVITY-FEED — `/activity` timeline over events.jsonl
8. PCLIP-WORK-QUEUES — `vanta queue` → team-ledger tasks run by assigned worker (QueueLoc.subdir generalization)
9. PCLIP-WORK-PRODUCTS — `team` artifact/artifacts actions, `vanta library --task`
10. PCLIP-ROUTINES-ISSUE — cron `--routine [skip|once]`: ticket per fire + `hasMissedFire` catch-up
11. CHANNEL-PERMISSIONS-WIRE — VANTA_APPROVER_CHATS chat approvals; poll-pump DEADLOCK FIX (blocked gateway loop can't poll its own reply; relay pumps + parks bypassed)
12. MSG-INLINE-APPROVAL — Telegram buttons; callback data IS the "yes/no <id>" reply (same relay/allowlist)
13. OP-MODEL-PRESETS — `models/presets.ts`; /effort remembers per-model, /model re-applies
(+2 doc-sync commits; root CLAUDE.md §Status carries the one-line summary of all of it)

## Conventions (unchanged from handoff-2026-07-04 + additions)
- Queue: `node scripts/build-order.mjs` → `~/Desktop/vanta-build-order-agent-readable.md`. SKIP live-infra/hardware/decision/entangled cards. Card ids RENUMBER after ships — regenerate, don't trust stale numbers.
- Per card: read `done` in roadmap.json; smallest complete slice; co-located vitest; RUN THE REAL PATH (CLI/tool executed live — every card above has one); tsc + size gate (`node --import tsx src/cli.ts lint <files>` from vanta-ts/) + FULL suite (`npx vitest run` from vanta-ts/, NEVER repo root); mark shipped (status/updated/notes only, validate JSON); commit w/ trailers `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_014LAHyyeYh6mfmtv81dZ2dU`; push.
- cwd drifts between Bash calls — prefix `cd /…/Vanta/vanta-ts &&` or use absolute paths.
- Provider live: codex gpt-5.5 (local auth) — real one-shot agent runs work (`vanta run`, runner, queue slices all used it).
- Repo `.vanta/` is the live data dir: back up + restore cron.tsv/tickets.json around live cron tests; rm test runner-jobs/work-queues dirs after.
- Size gate bites at cx>10 constantly → table-drive dispatch maps / extract helpers preemptively.
- vanta-ts/CLAUDE.md file map: one row per new module (done for all above). Root CLAUDE.md §Status + ROADMAP.md counts synced @ 11582; update again next doc-sync (now 11587).

## Known landmines (verified this session)
- Importing `tools/team.js` directly (not via all-tools/registry) hits a PRE-EXISTING module-init cycle (team-run → tools/index → all-tools). Drive tools via `ALL_TOOLS.find(...)`. Vitest is unaffected.
- The gateway loop BLOCKS during a turn — anything awaiting an inbound reply mid-turn must pump `platform.poll()` itself (see channel-approver pump + parked-message drain).
- `mem-eval` runner: no live models; public datasets at `.vanta/mem-eval-public-data`; baseline: longmemeval 99.9 (saturated), locomo hybrid 34.9.
- reference/ repos pollute repo-root vitest + codegraph results (Hermes Python files surface in explores — check paths).

## Next candidates (regenerate queue first; ids will have shifted)
- EXT-ACP-EDIT-DIFF (M) — pre-exec edit-diff approval + sensitive-path policy; pure policy testable.
- DECISION-CLASSIFIER (M) — classifier exists (`repl/decision-classifier.ts`); integration-heavy wiring into loop checkpoints.
- OP-NOTIFY-UNFOCUSED / OP-COMPLETION-SOUND (M) — desktop renderer; needs desktop-app test conventions.
- TUI block (TUI-V2-RAILS, VANTA-STRUCTURED-DIFF, hooks/teams/agents UIs) — ink-testing-library patterns exist.
- Skipped rocks (live infra/hardware/decision): BACKEND-SERVERLESS-LIVE, VOICE-WAKE-WORD, AMBIENT-SCREEN-CONTEXT, MSG-CHANNEL-PARITY (needs live-verify pass + a recorded decision), SURFACE-MOBILE-APP.

## Continuation prompt
Continue the Vanta roadmap grind toward Hermes/OpenClaw operator parity. Read: root CLAUDE.md, vanta-ts/CLAUDE.md, this handoff. Regenerate the queue (`node scripts/build-order.mjs`), pick the next clean self-contained deterministically-verifiable card, build the smallest complete slice with tests, EXECUTE the real path, verify green (tsc + size gate + full suite from vanta-ts/), mark shipped with dense notes, commit+push with the trailers. Doc-sync root CLAUDE.md/ROADMAP.md counts every ~5 cards. Never weaken the kernel boundary. Stop only for genuinely-blocked cards (park with a note) — skip, don't force.
