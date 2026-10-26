# Draft cleanup — supported metadata lookup and actual startup proof

## Scope and delivery boundary

This supersedes the unresolved startup-cleanup finding in
[the pending-owner checkpoint](DRAFT-PENDING-CANDIDATE-2026-10-26.md), for the
executed ordinary-history fixture only. The combined application remains an
external source candidate, not integrated or installed. No recovery/design
card closes; installed `71cf90cf` and owner state remain unchanged.

## Causes established, not inferred from the timeout

An instrumented private replay showed the list loaded, default profile known,
both orphan IDs selected and both probes returning `404: not found`. The
renderer requested a session-detail path absent from the TypeScript server.
That route failure was not evidence of session absence; weakening the guard
would have hidden the contract defect.

The old fixture also wrote localStorage without notifying the live store.
Shutdown then persisted the old in-memory map over those synthetic records.
The corrected fixture delivers the same storage event used by cross-window
reload, so the records exist in both memory and storage before cold restart.
Both failed setups and the instrumented trace remain retained, not relabelled.

## Candidate corrections

- `GET /api/sessions/detail?id=...&profile=...` now reads exact validated
  metadata without opening the chat, invoking a model or reconciling pending
  tool results. It reuses the listing projection, extracted beside the session
  schema, and the owned session reader. Missing is a specific 404; damaged
  storage remains an error with original bytes retained. Unsupported profile
  reads refuse with 409 before reading a different profile's data. This is
  refusal, not implementation of native profile switching.
- The existing renderer detail helper translates to that route, validates the
  returned stored ID and maps its model/folder/title metadata. The shared REST
  translation retains the requested connection/profile, timeout and intent;
  translated calls retain their own verb/body rather than replaying the input.
- Cleanup accepts exact missing-session acknowledgments in the native proxy's
  plain-text and JSON forms. Generic missing routes, 403/500 failures and
  similar prose remain inconclusive. Pending queued prompts, owned nonempty
  drafts and legacy text are retained, never automatically submitted or erased
  because their server row is missing.
- Temporary renderer instrumentation is removed from production source.

## Executed evidence and limits

- Initial metadata HTTP tests failed twice and the renderer test failed before
  correction. Final focused checks: **102 UI checks/seven files** and **eight
  runtime HTTP checks/one file**, including exact metadata, explicit routing,
  wrong-ID refusal, proxy error formats, unsupported-profile refusal and
  non-mutating damaged/pending session reads. Counts are not added to earlier
  overlapping checkpoints.
- Runtime and renderer typechecks pass. Runtime bundle and final
  renderer/main/preload builds pass. An initial compiler invocation targeted a
  nonexistent shim path; the supported runtime `npm run typecheck` passes.
- Whole combined packet size ratchet: **69 production files, no new/worse
  findings, 99 inherited**, unchanged baseline. Candidate source secret scan
  reports zero findings. No suppressions, dependency installs or baseline edits.
- Exact final source Electron/private home/loopback model: startup retention
  **three checks**, corruption/image restart **eleven checks**, queued crash /
  Edit / Cancel / Save / deliberate-send **six checks**. Each passes with zero
  renderer errors. Text/revisions/PNG bytes and queue ID survive; history and
  cleanup do not replay work. The startup journey makes one explicit anchor
  request; each image journey makes two deliberate requests.
- The reusable canonical `tools/proof/custody-startup-retention.mjs` was then
  independently executed against the candidate: three checks pass again.

The startup fixture contains one ordinary saved chat. A genuinely empty
backend's first-list notification has not been certified by this replay.
Native cross-profile/cross-window continuity, explicit legacy recovery, HUD,
unknown effects, power loss, OS clipboard, hardware/live-account and exact
packaged/installed acceptance remain open. Metadata reads cannot certify those.

## Preserved packet and re-entry

External root: `Vanta-backups/cleanup-reachability-20261026-aXtwwg/`.
The combined packet has **107 files, 409,458 bytes**, relative to
`2991be16003d63880ac2f6173bff862f92b3b918`; do not stack earlier packets.

- Patch SHA-256: `7842f9f33c928bad61acfb67ef37cebd574f5b0e876ee8bf18135e5041c2cc81`.
- Manifest SHA-256: `d3723f1acedaf1880c8baf5f3ecaa86b9a7ef620865327bf33ac4ba68db44c7f`.
- `freeze-receipt.json`, before/after copies and listed backup archive bind the
  candidate. Dry-run application succeeds without applying it. All 239 original
  dirty regular files and previous 100 frozen source files are unchanged.
- `final-focused-current.log`, `detail-runtime-green.log`, type/build/size/scan
  logs and `final-exact-*` result files retain the current proof. The diagnostic
  script/trace and unsuccessful runs remain separate from the deliverable.

Continue in a new editable copy. Next: establish the empty-backend first-list
path, explicit legacy recovery and native profile routing/persistence, then
fresh/GONE/HUD/concurrent/unknown-send review. Integrate and package only after
those engineering gates; execute the exact installed build with rollback.
Broader chrome still requires owner visual approval. No main merge, release/tag,
CI, paid service, protected-source edit, account effect or legacy removal.
