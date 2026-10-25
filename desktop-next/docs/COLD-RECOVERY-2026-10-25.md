# Failed-run recovery after restart — 2026-10-25

## Current boundary

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
- Real app replay then found that checkpoint content contained only the
  generated stop sentence. Both normal outcome producers now use assistant
  text after this turn's last user message, excluding previous turns and raw
  tool results. The saved request remains exact; exception handling retains
  its existing captured stream text.
- Reuse the live stop classifier so a typed successful or user-stopped outcome
  cannot reappear as a failed-run recovery card after reopening history.

Existing latest-message, offered-action and approval guards are unchanged.
Opening history never submits a request. Retry, checkpoint submission and
edited requests still require their deliberate existing user actions.

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
