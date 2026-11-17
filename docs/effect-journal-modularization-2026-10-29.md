# Effect journal modularization — 2026-10-29

## Result and boundary

Subsequent bounded delivery: [agent17](agent17-desktop-delivery-2026-10-29.md)
includes these source modules. Candidate and installed copies execute unknown
Gmail attention projection and separate ordinary chat/branch/cold-restart
journeys. This does not repeat every interrupted/concurrent source-journal case
or close O03-3 canonical unknown-effect resolution. Normal CLI stays12c05ed5.

The 539-line effect-persistence module is now a 78-line compatibility facade
over five focused internal modules. Existing exports and call signatures,
serialized journal/projection bytes, writer ownership and recovery behavior are
preserved. This is SOURCE architecture work, not a new user-facing capability,
installed delivery or a resolution of an uncertain external action.

O03-3 remains incomplete. Inspection found no supported evidence-bound clearing
path: canonical turn attention, consumed effect claims, saved run evidence and
conversation/queue holds are distinct. Clearing one ticket or setting a generic
Done flag must not release those holds or authorize another submission. The
extracted transaction boundary is a prerequisite, not a substitute for that work.

## Responsibilities

| Module | Responsibility | Lines |
| --- | --- | ---: |
| `agent/effect-persistence.ts` | Existing public calls; serialized transaction orchestration | 78 |
| `agent/effect-journal.ts` | Envelope identity/validation, projection order, durable commit and replay | 132 |
| `agent/effect-journal-lock.ts` | In-process sequencing and cross-process writer ownership | 114 |
| `agent/effect-journal-file.ts` | Atomic replacement and existing fsync behavior | 34 |
| `agent/effect-tool-projections.ts` | Pure approval/tool WorkItem, Run and Receipt construction | 113 |
| `agent/effect-host-projections.ts` | Pure host-effect metadata and truthful settlement construction | 112 |

The existing JSONL paths, envelope schema, hashing/property order, pending/applied
layout, stale-lock rules, timeout, projection-failure fallback and empty-root
behavior are unchanged. This does not add a store, schema, dependency, provider,
approval bypass, retry, migration, new grant or kernel policy. Journal hashes
detect changed bytes; they are not signatures or permission to trust model prose.

## Executed evidence

- Fixed-clock before/after runs through all three existing persistence APIs
  produce byte-identical output across 13 journal/projection files.
- An actual child process writes two durable envelopes while a private
  projection is obstructed. After SIGKILL, a distinct process recovers both
  chats as Needs You, with zero falsely verified items. A third process repeats
  recovery without changing projection bytes. This tests interruption after
  durable creation, not power loss or a kill during fsync.
- Three actual writer processes retain all 45 ordered transitions for 15
  independent operations, with no pending envelope left behind. This bounded
  local run is not a universal filesystem-concurrency guarantee.
- Actual source conversation → registered Gmail tool → unchanged Rust kernel
  → local OAuth/Gmail503 replay retains one attention item and two receipts for
  the repeated operation. No repeated submission/approval occurs; a separately
  approved second chat retains its own item. Exact draft and saved arguments
  remain; receipt metadata excludes fixture body/tokens. Actual source CLI
  `operator-spine` reports both items. No live Gmail account is used.
- Thirty-two focused checks across four files pass, including six new journal
  recovery/corruption cases. The six journal tests also pass after the final
  helper extraction. Native TypeScript and all five architecture boundaries pass.
- All six new source/test files pass strict size limits. Existing findings fall
  from 12 to three: only the unchanged 5/6/5 positional compatibility parameter
  counts remain. No suppression or disguised variadic signature was introduced;
  this is not a claim that all size debt or app modularization is finished.

## Preservation and delivery

The private checkpoint retains the original source, status/hash baseline,
fixed-clock outputs, process receipts and source-agent replay. Original 239
integration files, 13 legacy CLI files, 32 owner-data baseline files and 47 dirty
status entries remain preserved. No owner profile, credentials or approvals were
copied. Installed agent16 and its exact rollback remain unchanged. The normal
CLI stays e467a857; the independently verified 12c05ed5 candidate still awaits
fresh owner cutover approval and does not include this later extraction.

Roadmap/Trello updates record a prerequisite only; original Done criteria,
statuses, dependencies, checklist completion and WIP remain unchanged. A scoped
source/documentation Git bundle is retained. No main merge, public release/tag,
protected Rust/factory edit, paid service/CI or legacy removal occurred.

## Next required evidence

O03-3 still needs exact operation/receipt/account binding, a trustworthy result
observation rather than prose, serialized durable resolution with drift/replay
refusal, the intended chat's attention clearing, and another chat remaining
unchanged. Unknown effects stay consumed; neither review nor resolution may
silently retry the original effect or release automatic followers. Restart/
expiry and installed interaction have their own later evidence gates.

No full suite, installed replay of this extraction, live-account acceptance,
owner visual/parity sign-off, microphone/native-control or whole-product security
acceptance was performed. Dependency security remains open.
