# Unsent image continuity — engineering re-entry

## Latest parent review

[Supported metadata lookup and actual startup proof](DRAFT-CLEANUP-LOOKUP-2026-10-26.md)
closes the previous timeout's bounded engineering cause: a missing detail route,
plus a fixture overwritten by shutdown before its synthetic records were loaded.
The candidate has read-only metadata, exact-ID/owner validation, conservative
absence classification and retained unsent queues. Focused UI102/runtime8 pass;
exact source startup3, corruption/restart11 and queue6 pass, zero renderer errors.
The combined107-file source packet remains external/uninstalled;69 production
paths have no new/worse size findings. Empty-backend first-list, explicit legacy
recovery, native profile routing, HUD/concurrent/unknown-send and exact installed
gates remain. Start from this newer packet, not by stacking earlier patches.

[Pending-owner and modularized candidate](DRAFT-PENDING-CANDIDATE-2026-10-26.md)
supersedes the earlier raw-fallback/size-blocker state for the isolated copy:
unresolved input is gated, recorded owners resolve first-session handoff, and
seven extracted modules pass strict limits. The 64-path unchanged size ratchet
has no new/worse findings. Focused checks pass 205; exact source corruption and
queue restart journeys pass eleven and six checks. A separate actual startup
cleanup proof timed out twice and remains unproven; unit checks preserve unsent
owned/legacy text and image-only drafts. The frozen application packet remains
external and uninstalled. Legacy recovery UI, native profile continuity,
fresh/GONE/HUD/concurrent/unknown-send and exact installed gates remain open.

[Owner candidate and corrected profile triage](DRAFT-OWNER-CANDIDATE-2026-10-26.md)
records captured text keys/callers, explicit-owner draft titles and malformed
owner-key preservation. The isolated copy passes 53 focused checks and eleven
actual Electron recovery/restart steps. The real Create Profile UI also passes;
the earlier raw-bridge 404 bypassed the existing shim and was not that UI path.
Owner-undefined/legacy handling, native profile routing, ten new/worse size
findings and packaged/installed continuity remain open. The application patch
stays external; work from a new copy of the preserved packet, not the installed
app or the older frozen candidate.

[Draft-text recovery](DRAFT-TEXT-RECOVERY-2026-10-25.md) records a reproduced
bare-session profile collision (still unresolved) and an isolated correction
for corrupt shared reads erasing known drafts. Nine actual Electron checks
retain exact text/PNG through failure, Retry, valid recovery, restart and a
deliberate one-send. The combined patch remains external pending owner-key and
other continuity closure; the installed app is unchanged.

[Refactor and queued-edit proof](DRAFT-CUSTODY-REFACTOR-2026-10-25.md) supersedes
the earlier 34-finding size blocker: the isolated candidate now passes the
unchanged ratchet across 47 production files. Direct and queued restart replays
pass again, and the actual queued Edit/Cancel/Save journey now preserves a
separate unsent draft plus the original queue ID and exact PNG. Further
legacy/owner/surface/unknown-send review and packaged/installed proof remain;
the application patch is still external and the card stays open.

## Earlier parent review (historical)

[Parent application review](DRAFT-CUSTODY-PARENT-REVIEW-2026-10-25.md) records a
fresh installed `71cf90cf` image-loss reproduction and an isolated current-base
candidate with direct/queued image restart proof. Three real application
integration defects were corrected there. The full patch remains external:
34 new/worse size findings and further continuity review block promotion.
The installed app is unchanged and this card remains open.

## Earlier behavior and scope (historical)

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
