# Prototype interaction and feature audit — 2026-10-16

This is a completed inventory review and browser-prototype check. **It is not a full native Vanta acceptance run.** The redesigned application has not been implemented, and Claude visual equivalence still needs owner review. No live model calls, account connection, microphone/screen capture, terminal execution, background scheduling, or provider readback was used to claim success.

## Coverage and evidence

- All **296 unique inventory IDs** reviewed and assigned a preservation decision and destination: 245 shell entries plus 51 Vanta entries. `FEATURE-PRESERVATION.csv` retains original rows; `FEATURE-AUDIT.csv` adds explicit native acceptance gaps. This is feature coverage, not 296 passing native tests.
- **52 browser journeys** exercised with observed expected sample behavior. `PROTOTYPE-CHECKS.csv` lists every criterion. `evidence/browser-verification.json` records the assertions, sampled screens and candidate file hashes. These are manually recorded CUA results, not a newly authored automated regression suite.
- **108 registered action handlers**, **104 distinct literal action references**, **zero unresolved literal actions** in the structural audit. `INTERACTION-AUDIT.csv` accounts for every handler and distinguishes browser group evidence from source-only inspection. This does not imply every handler was individually clicked or every old handler is reachable.
- **23 screen samples** at widths 1440, 889 and 390 CSS px: one main h1, no horizontal page overflow, and no empty visible control names under the bounded DOM check. All major desktop destinations were sampled; narrow samples cover conversation/rail, cards, connections and profiles. This is not WCAG conformance or a full screen-reader audit.
- `node --check prototype/app.js` and `node audit-controls.cjs` executed successfully. The final test-tab console read returned no captured warnings/errors.

## Corrections made during the check

1. Scoped search and shortcut destinations to the selected profile; profile preferences, captures, schedules, notes and memory now have independent sample state. Cloning copies conversations/preferences but clears run receipts, queues and authority. Switching starts in Plan.
2. Made sample run state and timers belong to each conversation; a denied/stopped task does not affect another. The run captures its starting permission preset instead of reading a later selection.
3. Retained independent Chat/Code drafts, attachments, selected sessions and panels. Added persistent expansion for context and inline plan cards.
4. Added card library previews, output-specific copy/download content, and capture-to-draft follow-through. New conversations have their own empty state.
5. Added mobile Chat/Code controls, a visible rail Close control below the desktop breakpoint, Escape dismissal, and navigation drawer dismissal on selection.
6. Retained archive/restore rather than deleting sample conversations. Provider setup, installs, downloads, workers and schedules clearly distinguish drafts/previews from real effects.

The earlier 889px rail covering a conversation card was an overlay/viewport condition, not proof of a broken native details element. The final pointer and keyboard disclosure checks used the actual current viewport.

## Remaining boundaries and implementation work

| Area | Proven in this review | Still required |
|---|---|---|
| Layout and cards | Measured 288px reference sidebar; implemented shared shell, card rail, output grid, inline cards; browser sampled | Owner comparison against Claude at matching size/state; full font/spacing/icon refinement; native window/traffic-light behavior |
| Chat and Code | Draft, attachment, session, panel, handoff and queue sample flows | Real history/streaming/tool events, engine dispatch, long content, cancellation/race/reconnect and migration proof |
| Profiles | Sample create/switch/clone, scoped conversations/search/preferences, synthetic import and metadata export | Real profile schema, import validation, encrypted credentials, project/connection binding, migration/rollback; sample export deliberately excludes actual conversation data |
| Approvals and runs | Exact-action sample preview, one-use UI, stop/deny, unverified vs verified sample receipt | Kernel mediation, stale preview invalidation, replay protection, effect/readback and restart proof. Browser localStorage is not a security boundary |
| Connections | Nine catalog entries and scope previews | Real authentication, test/configure/trust/revoke/status, provider errors and account/recipient binding |
| Voice/capture/local models | Synthetic text/attachment, wake toggle and download progress UI | macOS permissions, local model bytes, dictation/playback, wake listening/off, cancellation and actual device behavior |
| Workers/automations | Drafts, schedule pause, workflow cancel, acknowledged worker pause and budget display | Real host/time-zone/sleep/wake execution, budgets/quotas, external CLI prerequisites, durable checkpoints and provider cost receipts |
| Outputs/memory/skills | Card drill-in, copy/download, canvas presentations, sample correction, skill toggle/install preview | Real format rendering, rich artifact semantics, scoped memory lifecycle, source/version validation and native tool capability execution |
| Advanced shell | Layout/compact previews; source-preservation destinations for legacy affordances | Native splits/tabs/pane swapping, detached windows, hotkeys/tray/quick chat/API/LAN/updater/signing/notarization acceptance |
| Accessibility/performance | Names/headings/overflow sample checks, Escape and keyboard plan disclosure, light/dark token switching | VoiceOver, full tab/focus management (including narrow overlays), contrast measurements, zoom/reduced motion, IME, large histories and native performance |

No feature is retired by this audit. Three historical owner-approved retirements remain identified in the plan. Unsupported/parked backend features stay explicitly labelled; they must not be presented as functional merely because a prototype has a destination card.

## Reproduce the bounded checks

Serve this directory on localhost and use a separate test port/origin to avoid overwriting the owner's review state. Walk `PROTOTYPE-CHECKS.csv` using only synthetic data. Use the permission preset, context rail sample run, Profiles, More destinations and Outputs tabs. Verify each visible result before recording it. Reset only the test origin if needed. Then rerun the two Node checks above. Browser assertions require a human or browser-control harness; the CSV is not executable test code.

The local checkpoint includes pre-existing concurrent Vanta source work. It is a recoverable Git snapshot, not certification of that source tree, its removed tests, the installed package, or a production release.

## Checkpoint gate record

The first commit attempt was stopped by the staged TypeScript size gate: 1,751 violations across 925 files, including existing imported desktop code and pre-existing runtime changes. This review edited no application TypeScript. The checkpoint uses the repository's documented `VANTA_LINT_BLOCK=0` warning-only mode for this command (`PARKED.md`, size-ratchet debt); secret scanning and architecture boundary checks remain enforced. Size debt is unresolved and must not be counted as a passing application check.
