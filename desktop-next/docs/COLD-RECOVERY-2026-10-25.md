# Failed-run recovery after restart — 2026-10-25

## Current boundary

**Candidate `5a13805f` is held, not installed.** Its initial seven-step packaged
replay passed, but independent review and a new actual packaged control exposed
loss of work across internal continuation prompts. Three renderer regressions
also proved Retry/Edit could select an internal prompt rather than the saved
human request. Review found that raw-message collection bypassed display
rewrites/suppression. These are one checkpoint/turn-boundary correction in
progress; passing the earlier cases or Apple notarization does not clear them.

This is a bounded runtime/renderer correction, not whole-Desktop acceptance or
the wider design proposal. The installed app remains source `14fee24d` until a
separate exact-source package, notarization, guarded installation and replay
are recorded here. Owner profiles and the terminal launcher are unchanged.

## Causes and correction

- The receipt writer and saved-session validator omitted the typed stop reason.
  Preserve that optional field from the actual outcome; old receipts remain
  readable and honestly generic. Do not infer a reason from event prose.
- Transcript projection dropped the saved recovery contract. Project only
  bounded, validated failure metadata onto the same failed assistant row;
  preserve empty/tool-only failure rows. Do not forward events, traces or
  arbitrary checkpoint fields. Keep legacy machine notices separate.
- Real app replay found that checkpoint content contained only the generated
  stop sentence. The first raw-history correction was insufficient: the agent
  can add internal user-role continuation prompts during one human request,
  and raw assistant history precedes display rewriting or suppression.
  The replacement captures only existing post-display `onText` output plus
  the displayed final result. Capture resets for each external or queued
  instruction and clears on cleanup; the response reuses the persisted
  receipt. It never scans raw transcript roles or matches internal nudge prose.
- Retry and Edit bind to the receipt's exact original instruction instead of
  the nearest user-role message. A missing matching request fails closed
  rather than resubmitting a different request. Ordinary answer regeneration
  keeps its existing behavior. Exception handling retains its existing stream
  capture; this change does not certify that separate path's display policy.
- Reuse the live stop classifier so a typed successful or user-stopped outcome
  cannot reappear as a failed-run recovery card after reopening history.

Existing latest-message, offered-action and approval guards are unchanged.
Opening history never submits a request. Retry, checkpoint submission and
edited requests still require their deliberate existing user actions.

The assistant-ui Reload callback supplies the selected assistant as
`config.sourceId` and its preceding row as `parentId`. Both the main chat and
session-tile adapters now retain that source identity instead of discarding it.
User rows retain canonical `sourceText` separately from their display-only
caption, through hydration, optimistic attachment synchronization, runtime
metadata and transcript equality. Recovery matches that canonical request;
ordinary display text does not become a durable identity. Internal continuation
rows within the receipt-bound request do not trigger a deep-cut confirmation;
later human requests still do. No source text is added to logs or receipts.

## Executed evidence

External evidence/backup root:
`Vanta-backups/cold-recovery-integration-20261025-01ajgl/`.

- Parent reproduced the original red regressions: two receipt/store tests lost
  the reason; seven renderer cases lost the failure/recovery projection.
- A new red receipt case reproduced omission of actual current-turn work.
  Three additional red projection cases caught inappropriate recovery for
  typed `done`, `interrupted` and `soft_stopped` outcomes.
- Focused runtime checks: 23 tests across receipt, session schema and real
  temporary-directory store save/reopen/export. Runtime typecheck exits zero.
- Focused renderer checks: 116 tests across the stored transcript adapter,
  hydration, recovery controls and session bridge. Renderer typecheck exits zero.
- First actual source replay: Retry survived restart and resumed once, but
  checkpoint partial-work assertion failed. Its result and screenshots remain
  in `source-proof/`; they were not overwritten or weakened.
- After fixing the producer, `source-proof-v2/result.json` passes seven actual
  Electron journey criteria across three cold restarts: same specific reason,
  visible partial work and all offered actions restored; zero model requests
  from reopening; Retry, checkpoint and Edit each start exactly one additional
  turn; older failures cannot offer recovery for a later request. Thirteen
  loopback scripted-model requests and zero renderer errors were observed.
  This replay precedes the final non-failure classifier guard; the final
  packaged candidate still requires its own replay.
- Source Vite, Electron main/preload and runtime bundles build. Existing font,
  chunk-size and dynamic-import warnings remain; no warning is suppressed.
- Actual size analysis across ten TS files finds zero new/worse findings;
  hydration becomes smaller through one cohesive error-projection extraction.
  No baseline or gate is edited.
- The held `5a13805f` package fails the added real continuation control:
  `packaged-nudge-control/result.json` records lost pre-nudge checkpoint work,
  four loopback requests and zero renderer errors. Notarization does not
  clear this functional failure; that package must not be installed.
- Replacement producer regressions execute the actual conversation, chat
  handler and private session persistence: three red cases reproduced
  rewritten/suppressed raw-text leakage and pre-nudge work loss. The corrected
  five-file runtime check passes 27 tests, including actual queued-instruction
  isolation and existing typed SSE. Three renderer files pass 54 tests,
  including receipt-bound Retry and the real inline Edit composer with an
  intervening internal user row. Both final typechecks exit zero.
  These checks do not replace the expanded packaged restart journey.
- `source-displayed-v3/` retains the failed expanded source replay: checkpoint
  capture survived, but the real Reload callback still selected an internal
  prompt. Seven criteria completed before recovery failed; 19 loopback model
  calls and zero renderer errors. This exposed the discarded `sourceId` above.
- After the request-binding correction, seven focused renderer files pass
  197 tests. They include the actual prompt-action hook callback, attachment-only
  and captioned requests, expanded skills, distinct references sharing a caption,
  the inline Edit composer and existing deep-cut guards. A further five targeted
  transcript-equality tests pass (137 unrelated cases deliberately not run).
- `source-displayed-v4/` passes the previously failing internal-continuation
  Retry journey: three criteria, six loopback requests, zero renderer errors.
  `source-file-v4/` passes the actual cold-restart attachment Retry journey:
  three criteria, five requests, exact original attachment-bearing request
  delivered once after deliberate Retry. These are source Electron checks;
  the final clean package still needs the complete expanded replay.

The script is `node desktop-next/tools/receipts-queue-proof/cold-recovery.mjs
<private-output>`. It reuses the existing real-shell sandbox and local scripted
model. Its retained HOME, userData, VANTA_HOME, projects and loopback ports are
isolated. It never reads owner credentials or sends to a real provider.

## Still required

Exact clean-source signed package; packaged
and installed restart/recovery replay; installer rollback, signature/notary and
identity checks. No full-suite, live-account, physical focus, screen-reader,
microphone, whole design or unfamiliar-person acceptance is claimed. Draft/image
custody remains a separate unintegrated patch and cannot be closed by this work.
