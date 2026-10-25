# Settings recovery in the terminal UI — 2026-10-25

Source follow-on to TARGET-WRITER-GUARD-2026-10-25.md. This is the existing Ink
/config and /sandbox workflow, not a new Electron visual design or installed
TTY/VoiceOver acceptance.

## Executed cause and correction

Late save rejection previously escaped as an unhandled promise; initial loader
errors were silently caught. The baseline real-Ink test has four failures and
two unhandled rejections. Config/sandbox now retain the previous displayed
values, publish persistent recovery text and preserve suspect target bytes.
Error props reach both panels through the actual LiveBody host. Initial failure
opens an explicit recovery panel with Escape and file/reopen instructions,
not a fabricated default settings view. No automatic retry or repair write.

A pending-view identity guards asynchronous success/error publication, including
old callbacks after closing/reopening the same kind. No background result may
reopen or replace the user's new view. Post-save reload failure is phrased as
unconfirmed, not an unproven no-write claim.

## Evidence and limits

- Parent30focused tests/fivefiles and runtime typecheck pass, including real
  useOverlay → LiveBody → panels → keyboard Enter → actual target writer.
  Suspect bytes and previous values survive, explicit fixture repair/Enter
  succeeds, Escape closes, and late resolve/reject cannot replace navigation.
- Independent four-journey real-Ink/fake-stdio run has zero unhandled
  rejections and zero socket/TLS/network-fetch/subprocess counters. One local
  embedded-WASM data fetch initializes Yoga and is separately recorded.
  Receipt: proofs/settings-recovery-ui-2026-10-25/direct.json.
- No owner file/profile, live account or external service is used. One
  accidentally generated duplicate build-order export was removed; canonical
  roadmap/history remained untouched.

This is target preservation and honest recovery, not all-layer transaction
integrity, atomic/CAS/symlink safety, installed TTY, screen-reader or whole
Desktop acceptance. The broad cards remain open.
