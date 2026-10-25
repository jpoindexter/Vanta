# Unsent image continuity — engineering re-entry

## Current behavior and scope

The retained actual packaged `4a2f4ab8` continuity run passes ten checks, then
loses image attachment chips on cold restart. Text/model remain and no model
request is replayed. The relevant attachment persistence code is unchanged in
the later `510e0450` candidate; this is not a newly executed failure on that
candidate. Queue/unread/reading-position phases after the failure remain unrun.

`store/composer.ts` deliberately persists text only; attachments were kept in
memory. Adding base64 to its bare-session-ID localStorage map is not safe:
session IDs are scoped by connection/profile, not globally unique. Restoration
must preserve actual preview/send bytes, not merely paint a filename chip.

## Preserved experiment — do not integrate as complete

The isolated experiment has bounded validated image records, a fixed private
Electron directory, owner/session hash keys, atomic temporary replacement,
explicit errors and no arbitrary source-file reads, uploads or model actions.
It also explores owner-scoped text synchronization. It is not in shared source
or the installed app.

Private checkpoint `prewarm-custody-20261025-CBOp8C` retains:

- `draft-custody-EXPLORATORY-NOT-READY.patch`, 25 files/1,313 diff lines,
  SHA-256 `3dd6bc615cd10188d5ff05ab72ff8bb04d751b96339972cc470fb3279b5c7507`.
- `draft-custody-REVIEW-NOT-READY.md`, SHA-256
  `d4fe88fe109300b87c1d958699ce4e1190349054705304981d14c5bcb1ec9c58`.
- Original scratch `/tmp/vanta-draft-custody-BsK48P`, including narrow receipts.

Worker-executed checks: native custody six, changed-path UI 60, bridge three,
existing scoped profile four; both typechecks pass. These are overlapping
component layers, not complete app acceptance. No new UI was launched.

Parent review demonstrated that the first base64 validator threw a RangeError
on an allowed 5 MiB image; its replacement has executed 5/10 MiB checks. Review
also found failed moves deleting the source, stale owner-map text after HUD
storage updates, and new drops replacing unseen saved images. The scratch
contains targeted corrections, not parent-installed proof.

## Three required engineering closures

1. Fence stale captured writers across acknowledged profile archival. Current
   TS profile IDs are stable `safeLookup` IDs, archived IDs remain reserved and
   display rename does not change ID/home. The shim exposes `view.id` as
   `ProfileInfo.name`. Do not migrate custody to the typed display label or
   assume current TS supports delete/recreate with the same ID. Mounted cleanup
   and retry can still recreate retired custody: durable owner lifecycle fencing
   is required. A proposed local custody lease must not grant gateway/account
   authority or silently refresh on a stale retry. Remote identity is unproven.
2. Finish hydration/submit arbitration. Keep unseen saved bytes on read failure;
   preserve newly added live attachments; a submit/clear before restore settles
   must not silently omit images, erase the saved draft or resurrect a sent
   image. Error/retry must describe the actual retained data.
3. Bind late submit outcomes to the captured immutable draft address, not a
   freshly read active profile or fresh-draft scope. Preserve collision,
   compression/rekey, same-ID cross-owner, HUD and failed-write semantics.

These are engineering tasks, not an owner-approval blocker. Resolve them in the
isolated implementation before integrating. Then run the real packaged
two-chat/drop/preview/cold-restart path with exact byte/identity/request-ledger
checks; continue to queue/unread only after that leg passes. No source-only
tests, synthetic chip or plumbing claim closes the user-visible criterion.
