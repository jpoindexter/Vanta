# Handoff — Vanta roadmap grind (operator parity: Hermes/OpenClaw)

Generated: 2026-07-07
Project: `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta` · branch `main` (grind commits direct-to-main + push, required trailers below)
Goal (session Stop-hook): keep pushing through the roadmap in logical order toward Hermes/OpenClaw operator stats; everything green; no stubs; commit+push every slice.

## State
Horizon **125 → 70** (54 slices shipped 2026-07-06→07 + 3 building mechanisms, every one: complete slice → co-located tests → real-path/model verified → tsc + size gate + FULL suite green → roadmap.json notes → commit+push). Last full verify: **1070 files / 11979 tests** @ `00c6cddb`. Kernel untouched (67 tests). roadmap.json: **1016 shipped · 69 horizon · 3 building · 28 parked** (72 open).

**STOPPED 2026-07-07 at Jason's explicit request** ("ok stop when done with current task"). Not vein-forced mid-work — the last task (TUI-KEYBOARD-SHORTCUTS) shipped clean; nothing half-done. The clean offline-verifiable pebble vein IS worked out: every remaining open card needs a **decision or setup**, not just execution — dep sign-offs (tree-sitter-bash for the safety layer, transformers.js for WINNOW-LOCAL-SCORER), live-infra rocks (BACKEND-SERVERLESS-LIVE is the ambient-operator keystone, voice-wake, mobile, desktop, screen-context), UI dialogs needing an Ink render harness (GLOBAL-SEARCH-OPEN-TRIGGER — dialog exists, just needs a trigger wire; VANTA-EXPORT/MEMORY/OUTPUT-STYLE/WORKFLOW-MULTISELECT dialogs), agent-loop behavior needing live eval runs (AHE-INTERACTION-AWARE, OP-ADVERSARIAL-UX, PCLIP-CEO-CHAT), harness-limited A/Bs (BRAIN-ADD-ONLY-AB — the static recall harness can't discriminate FORMATION policies), or the 3 building partials' cross-cutting wiring.

### The 3 building partials (each: mechanism done + tested, one bounded thread to finish → shipped)
- **TUI-SELECT** — pure selection engine shipped+tested. Blocker: Cmd+C/X/V can't reach a TTY (verified — the emulator owns Cmd; Ink key.meta = Alt). Decision needed: remap Cmd→Ctrl/Shift for select-all/copy/cut, or accept terminal-owned Cmd.
- **AHE-REGRESSION-FORESIGHT** — foresight ranker + offline backtest shipped+tested (beats the frequency baseline on fixtures). To ship: a live `vanta evolve` journal over the real corpus to cite recall-vs-11%.
- **VANTA-COMMIT-ATTRIBUTION** — hash-track + Co-Authored-By trailers + `extractEditedPath` stream seam shipped+tested. To ship: thread an optional `sessionId` into `ToolContext` → git-commit tool appends `trailersForSession` + external-cli calls `recordAgentEdit` per Write/Edit stream line.

### Slices 40–54 (this session, after 35–39 below):
40. KEYBINDING-CUSTOMIZATION — `ui/keybindings.ts`; config-driven chords live on the TUI (app-keys dispatch by resolved chord→action).
41. VANTA-SHORTCUT-DISPLAY — `ui/shortcut-display.ts`; help/tree hints read the live keybinding config.
42. VANTA-VIM-OPERATORS — `ui/vim-motions.ts` + rewritten `vim-mode.ts`; counts/operator+motion/text-objects/find (3dw, ci', f().
43. BRAIN-FUSION-AB-SUMNORM — `search/fusion-sumnorm.ts`; measured A/B, RRF beats sum-norm on LoCoMo (48.4 vs 44.3), kept + loser documented.
44. VANTA-SUGGESTIONS — `repl/suggestions.ts`; `/suggest` recap + ranked next-step, auto-recap on resume.
45. ASI-RECURSION-METRICS — `evolve/recursion-metrics.ts`; self-evolve lift/spend/human-in-loop + compounding-vs-tapering trend, `vanta evolve metrics`.
46. VANTA-SKILLS-HUB — `skills/agentskills-format.ts`; agentskills.io import/export/hub, third-party skills load without code changes (store round-trip lossless).
47. VANTA-BLUEPRINTS — `blueprint/apply.ts` + `vanta blueprint`; data-driven scaffolds, new ones drop into ~/.vanta/blueprints (bundled vanta-tool blueprint).
48. VANTA-COST-GUARD — `budget/guard.ts`; pre-turn warn-near + halt-before-crossing cost ceiling (wired into the session cap).
49. ND-CHOICE-REDUCE — completed the "full list on request" half (`formatChoiceList` + `/suggest all`).
50. WORLD-MODEL (first slice) — `world/system-map.ts` + `vanta world map`; index _active/ repos (stack detect + git state) as world entities. Live-verified on 37 repos.
51. TUI-CMD-BACKSPACE-TERMINALAPP — `term/cmd-backspace-hint.ts`; one-time Terminal.app hint (Cmd+Backspace needs a kitty terminal; use ^U).
52. VANTA-VIM-VISUAL-MODE — visual mode on the vim engine (`v` selects, motions extend, d/y/c/x operate).
53. ND-TIME-RANGES — `repl/time-ranges.ts` + `/time`; estimates as best/realistic/worst ranges + elapsed/since-last.
54. TUI-KEYBOARD-SHORTCUTS — Cmd/Opt+Backspace composer chords were already wired; added the missing Opt+Backspace test to close honestly.

### Next-session highest-leverage moves (need Jason's call):
1. **Approve a dep** → build tree-sitter-bash (safety-layer command-substitution parsing) or WINNOW-LOCAL-SCORER (transformers.js logprobs).
2. **Name the keystone live-infra rock** → BACKEND-SERVERLESS-LIVE (wake-on-message host) unlocks the whole ambient-operator story.
3. **Say "finish the building partials"** → each is one bounded thread (above).
4. **TUI dialog tranche** → establish the Ink dialog render-test pattern, then GLOBAL-SEARCH-OPEN-TRIGGER (dialog exists) + the export/memory/output-style/workflow dialogs fall quickly.

### Slices 35–39 (after the numbered list below):
35. PCLIP-WORKSPACE-PORTABILITY — `workspace/portability.ts` + `vanta workspace export/import` (scrubbed bundle, collision handling). Also fixed a HARNESS-SKILL-GATING regression (was skipping the operator's own security-topic skills — now warn-don't-skip; VANTA_SKILL_STRICT=1 to hard-skip).
36. BRAIN-BM25-LEXICAL — `search/bm25.ts`; MEASURED LoCoMo recall@5 32.4→47.8, hybrid 34.9→48.4 (the session's biggest recall win).
37. SEC-GODMODE-DETECT — `prompt/jailbreak-signatures.ts` (defensive, folded into the skill injection scan).
38. HARNESS-EVENTS-WAIT — `events/cursor-reader.ts` (cursor read + capped long-poll).
39. PCLIP-DELEGATION-UPDOWN — `team/delegation.ts` (org delegate-down / escalate-up → task ledger).

### The clean pure-slice vein is WORKED OUT (why the per-turn pebble cadence ends here)
After 39 slices the scan (`/tmp/scan3.py`) returns only larger-grained cards, none shippable as a crisp unit-tested pebble:
- **Agent-loop behavior**: AHE-REGRESSION-FORESIGHT (ranked at-risk-task set before commit — needs the loop + edit graph + measurement), OP-ADVERSARIAL-UX (a live run driving the app as a persona), AHE-INTERACTION-AWARE, PCLIP-CEO-CHAT.
- **Live TUI/Ink component wiring** (need ink-testing-library render tests, not pure logic): TUI-SELECT, VANTA-TEXT-SELECT-TUI, VANTA-VIM-OPERATORS (engine is pure but composer wiring is Ink), VANTA-TEAMS-UI, VANTA-HOOKS-CONFIG-UI, VANTA-MESSAGE-ACTIONS, VANTA-STRUCTURED-DIFF navigator overlay, TUI-V2-RAILS, GLOBAL-SEARCH-OPEN-TRIGGER, OP-COMPACTION-VISIBLE.
- **Registry-gated**: KEYBINDING-CUSTOMIZATION (build DEFAULT_BINDINGS + ~/.vanta/keybindings.json loader + live app-keys dispatch rewire) → unlocks VANTA-SHORTCUT-DISPLAY + VANTA-SHORTCUT-DISPLAY.
- **Live-infra / decision rocks**: BACKEND-SERVERLESS-LIVE, VOICE-WAKE-WORD, AMBIENT-SCREEN-CONTEXT, SURFACE-MOBILE-APP/RUN-ANYWHERE-TERMUX, MARKETING-ANALYTICS-CONNECTORS, MSG-CHANNEL-PARITY, DESKTOP-*.
**Next-session decision for Jason:** pick a tranche — (a) the TUI component pass (needs an ink-testing-library harness pattern established first), (b) the agent-loop AHE/cofounder behavior cards (integration + eval-measured), (c) the KEYBINDING registry unblocker, or (d) a decision on the live-infra rocks. Regenerate the queue first; ids shift.

### Slices 26–34 (after the numbered list below):
26. HARNESS-FLATTEN-TEXT — `agent/flatten-text.ts` (any content shape → text)
27. MSG-MEDIA-PATH-RECENCY — `gateway/media-send-guard.ts` (anti-exfil recency gate)
28. HARNESS-IMAGE-SHRINK — `agent/image-recovery.ts` (compaction media strip + 413 retry)
29. HARNESS-BLUEPRINT-SKILLS — `skills/scheduled.ts` (`schedule:` frontmatter → cron)
30. HARNESS-SKILL-GATING — `skills/gating.ts` (prereq gate + pre-load injection scan)
31. SELFHARNESS-SUITE-PRUNE — `verify/suite-prune.ts` (flag stale regression locks)
32. WEB-BACKEND-SPLIT — `search/index.ts` (per-capability search vs extract backend)
33. VANTA-MARKDOWN-TABLES — `ui/markdown-table.ts` (GFM tables: borders/align/wrap)
34. VANTA-STRUCTURED-DIFF — `util/diff-structured.ts` + transcript color-diff

### ⚠️ Still-skipped (precondition/decision-gated — do NOT force)
- VANTA-SHORTCUT-DISPLAY — needs a live keybinding REGISTRY (KEYBINDING-CUSTOMIZATION, unbuilt) — would be a stub without it.
- MSG-PLUGIN-PLATFORMS (needs a 2nd transport), HARNESS-EGRESS-ISOLATION (Docker deploy story), EXT-MCP-SERVE-COMMS (multi-platform comms), VANTA-TREE-SITTER-BASH (heavy tree-sitter dep).
- Rocks needing live infra/hardware/decision: BACKEND-SERVERLESS-LIVE, VOICE-WAKE-WORD, AMBIENT-SCREEN-CONTEXT, MSG-CHANNEL-PARITY, SURFACE-MOBILE-APP, MARKETING-ANALYTICS-CONNECTORS, DESKTOP-*.
- KEYBINDING-CUSTOMIZATION (M) is the highest-value unblocker: build the DEFAULT_BINDINGS registry + `~/.vanta/keybindings.json` loader; it unlocks VANTA-SHORTCUT-DISPLAY + the shortcut-display cards.
**Remaining clean pebbles exist deeper in the queue — regenerate `node scripts/build-order.mjs` and scan with the /tmp/scan_cards.py heuristic (buildable = done mentions tested/pure/store/parse and NOT captured/deferred/live).**

### Slices 23–25 (after the numbered list below):
23. PCLIP-SCOPED-SECRETS — `secrets/scope.ts`, per-run secret grants, fail-closed
24. EXT-MODEL-CATALOG-REMOTE — `providers/catalog-manifest.ts`, remote manifest w/ full fallback chain + atomic cache
25. EXT-MCP-CATALOG — `mcp/catalog.ts`, `vanta mcp install`, per-server `tools` allowlist wired into the mount loop (read-mostly default)

### ⚠️ Near-queue is now decision/precondition-gated (why the clean grind paused here)
The next `next`/small cards in build-order are NOT clean buildable slices — each waits on a precondition or a Jason decision, so they were skipped (skip-don't-force):
- **MSG-PLUGIN-PLATFORMS** — done = "demonstrated when a second transport lands"; no second transport exists yet.
- **HARNESS-EGRESS-ISOLATION** — "captured for the SEC backlog / a future Docker deployment story"; deployment-layer, not code.
- **EXT-MCP-SERVE-COMMS** — "full bridge deferred until multi-platform comms exist" (the `events_wait` primitive already split out).
- Remaining rocks need LIVE infra / hardware / a decision: BACKEND-SERVERLESS-LIVE, VOICE-WAKE-WORD, AMBIENT-SCREEN-CONTEXT, MSG-CHANNEL-PARITY (needs a live-verify pass + a recorded native-mobile/ecosystem decision), SURFACE-MOBILE-APP, MARKETING-ANALYTICS-CONNECTORS.
**Next-session move:** either (a) pick a TUI/desktop card (TUI-V2-RAILS, VANTA-STRUCTURED-DIFF, hooks/teams/agents UIs — need ink-testing-library patterns) or (b) get a Jason decision on MSG-CHANNEL-PARITY scope + the serverless-live rock. Regenerate the queue first; ids shift.

### Slices 14–22 (after the list below), all green + pushed:
15. EXT-ACP-EDIT-DIFF — `acp/edit-policy.ts`, pre-exec diff + session allow_always w/ sensitive-path floor (fixed a dynamic-import flake, ERRORS.md)
16. DECISION-CLASSIFIER — `agent/decision-log.ts`, user-challenge can't ride an auto-approve grant; taste batches at `/where`
17. OP-CHECKPOINT-ROLLBACK — turn-granular file rollback, `/rewind turn` (gap found: was per-mutation)
18. MSG-CAPABILITY-DESCRIPTOR — `gateway/platforms/capabilities.ts`, adapters declare charLimit/lenUnit/edit/threads/dialect
19. EXT-MODEL-NORMALIZE — `providers/normalize-model.ts`, vendor-prefix canonicalizer at the resolveProvider seam
20. PORT-A2A-TRANSPORT — `a2a/local.ts` DeliveryTransport seam, networked transport drops in without editing send()
21. EXT-MEMORY-FIELD-SCHEMA — `config/field-schema.ts`, config surface as data, secrets write-only
22. ASI-FORECAST-CALIBRATION — `solutioning/calibration.ts`, calibrated ranges + uncertainty drivers + revisit trigger
(OP-MODEL-PRESETS was slice 13/14 boundary — `models/presets.ts`, per-model effort memory.)

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
