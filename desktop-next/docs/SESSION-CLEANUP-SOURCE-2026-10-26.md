# Session lookup and empty-history cleanup — source checkpoint

## Current boundary

This checkpoint integrates a bounded source slice, not the whole draft-custody
candidate or a new installation. `/Applications/Vanta.app` remains the unchanged
`71cf90cf` recovery2 bundle. The full Desktop, recovery and owner-approval gates
remain open. No card changes status, Done contract or dependencies.

## What entered the integration source

Twelve production/test files implement two related corrections:

- Exact, read-only session metadata through the existing control table and REST
  shim. The shared listing projection is reused. Reading uses the validated raw
  session reader, not resume/reconciliation; no transcript or system prompt is
  returned. Missing is a specific 404, unreadability remains an error, and an
  unsupported profile refuses with 409 before reading another home. Requested
  connection/profile/timeout/intent survives mapped calls; each mapped call
  keeps its own method/body/upload. A response for a different stored ID refuses.
- Cleanup readiness is distinct from row-array identity. The sidebar preserves
  its existing no-op identity optimization but acknowledges a healthy backend
  result, including an empty list. Partial/failed/retry/corrupt/missing-list
  results and local optimistic rows do not establish that fact. Existing
  publisher-ownership guards and gateway resets still fence stale reads.
- Confirmed missing chats may lose stale pins, never unsent draft or queue
  payloads. The older cleanup deleted both; promoting the lookup without this
  preservation guard would make that unsafe branch newly reachable. Only exact
  native/plain or JSON 404 missing-session acknowledgments establish absence;
  generic routes, permission/server failures and similar prose do not.

The readiness atom is feature-local and does not force unchanged sidebar rows
to repaint. Existing debounce, concurrency and stale-probe fencing remain.
No dependencies, baseline changes, protected sources or approval-policy changes.

## Executed on this integration source

- Regression reproduction: six failures in the old cleanup prove discarded
  text/queue/image-only drafts and inconclusive-error misclassification.
- Final focused UI: **137 checks in seven files**. Runtime session/control:
  **27 checks in two files**. These overlap earlier checkpoints and are not
  added to their totals.
- Renderer/runtime typechecks and final runtime/renderer/main/preload builds
  pass. Eight changed production paths have no new/worse size findings against
  the unchanged baseline; nine inherited findings remain.
- `tools/proof/session-metadata-read.mjs`, actual source Electron/native bridge:
  **three checks**, one deliberate loopback-model request, zero renderer errors.
  Exact ID/cwd/model/turn metadata, no transcript/system prompt, distinct
  missing/profile refusal and byte-identical saved session are observed.
- `tools/proof/session-reference-cleanup.mjs`, actual source Electron/private
  home, two launches: **three checks**, zero model requests/errors. Empty
  history remains empty; stale pins disappear while current v3 unsent text and
  local queued request ID/content survive exactly.

The first queue fixture incorrectly delivered a cold-start entry as a new live
cross-window request. Its normal auto-drain attempt added `drainFailures: 1` and
failed the exact-record assertion, with no model request. That failed run remains
retained. The final fixture stages saved queue bytes for the next launch, where
the existing restored-queue policy pauses them. This is not proof of every live
auto-drain failure path: the inherited retry-exhaustion removal branch remains
an explicit follow-on gate. No passing result is inferred from that first run.

## Wider isolated candidate — not integrated

The empty-history defect was first reproduced in the wider custody candidate.
Two new hook-level cases failed before the readiness correction; final focused
checks pass **90/four files**. Renderer types and final build pass. Whole packet
size check covers 70 production paths, no new/worse findings, 104 inherited.
Candidate secret scan: zero findings across approximately 3.14 MB.

Actual final source Electron replays pass: empty-history **four checks** with
zero requests and a confirmed empty session store; corruption/image restart
**eleven checks**; queued crash/Edit/Cancel/Save/once-send **six checks**. Each
has zero renderer errors. The latter two use two deliberate loopback requests
each. These prove only their private fixtures, not installed, account or hardware
acceptance. The reusable empty-history proof was independently run from here.

Frozen external packet: `Vanta-backups/empty-history-20261026-OO73J2/`.
Do not stack it with older packets or apply it wholesale to the later source.

- `EMPTY-HISTORY-APPLICATION-NOT-READY.patch`: 110 files, 473,824 bytes,
  based on `bdce28276b74cc42e1158ddc4ed465529aeb92e9`.
- Patch SHA-256: `ac39f44012e96a482aa9dc6f6e8db19fe9edab5d0edfa6bf9720b92779f203e2`.
- Manifest SHA-256: `c6304e015b57c9e07b5b94767a24035a2f040fab8ff84f55da55dd1a115376d4`.
- Before/after copies, archive and freeze receipt bind that base. The original
  239 dirty regular files, previous 107 frozen files and installed ASAR remain
  unchanged. A dry-run applied before this narrow source promotion.
- The twelve-file integration slice reuses only dependency-ready code; it does
  not bring in the candidate's v4 ownership/native image-custody protocol.

## Next engineering gate

Continue from a new copy of the frozen candidate, reconciled against the new
integration head rather than stacking patches. Finish explicit legacy recovery,
native profile routing/persistence, HUD/concurrent custody and unknown-send /
auto-drain failure behavior. Then integrate the remaining approved source and
execute ordinary chat/restart on the exact packaged, signed/notarized and
installed candidate with rollback. Broader chrome visual/parity, human,
live-account and hardware gates remain distinct. No main merge, public tag or
release, paid services, CI, protected Rust/factory/MANIFESTO edits or legacy
capability deletion.
