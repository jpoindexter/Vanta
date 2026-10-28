# Foreground Stop checkpoint — 2026-10-28

**Source checked, not yet delivered in a rebuilt app or normal CLI pin.**
Installed agent4 and the normal CLI remain separately accepted code `7d32e58f`.
This checkpoint does not close whole-agent cancellation, trust or Desktop cards.

## Observed cause and repair

The parent selected a per-turn cancellation signal but omitted it from tool
contexts and foreground delegate/swarm spawn options. Stop could therefore leave
a child running, and a later provider result could still write a file. The tool
batch also lacked a cancellation checkpoint between calls. An inner replacement
approval could arrive after Cancel and still authorize a write.

Carry the existing effective signal through a copied, turn-local ToolContext,
including stream-prefetch dispatch. Check cancellation before dispatch, after
asynchronous gates/hooks/journaling and before later batch calls. Foreground
delegate and swarm reuse the worker runner's existing signal support. Recheck
approval cancellation after saved-rule lookup, human response and durable
approval transition. No new cancellation framework or dependency was added.

Explicit `delegate(background:true)` keeps its existing durable detach boundary.
Its detached context and approval wrapper do not capture the originating turn's
signal; this changes cancellation inheritance only, not kernel, fresh approval,
saved rules, access modes or host approval decisions. A new real parent/child
conversation check exercises that approval-lifetime boundary separately.

An already observed effect stays recorded; Stop is not rollback. Incomplete or
already-started uncertain work retains unknown/unverified receipts and cannot
automatically retry. Unstarted later calls receive no-effect transcript results.

## Executed evidence

Private parent packet: `docs/Vanta-backups/worker-stop-parent-20261028-7pi0Jz`
outside the application repository. Independent actual CLI packet:
`docs/Vanta-backups/delegate-cancel-20261028-y5Y0Ls`.

- Five original regressions fail before the repair: cancellation during safety
  assessment, a later batch call after Stop, current-turn signal identity, and
  actual delegate/swarm child conversations dispatching a late returned tool.
- A real write_file regression reproduces replacement after a late approval;
  the guard retains original bytes. The background approval regression first
  catches inherited cancellation, then passes without bypassing host approval.
- Final parent focused run: 99 checks across ten relevant files. Runtime
  typecheck and strict size checks for all seven production files pass.
- Actual source CLI ACP → foreground delegate → loopback provider → actual
  write_file and the unchanged real Rust kernel reproduce write-after-Cancel.
  After signal propagation, the child request closes before release, the file
  is absent and exactly two provider calls occur, with natural CLI EOF exit 0.
- A second real CLI replay holds the exact offered one-time overwrite approval,
  sends Cancel, then returns that offered allow_once. Before the approval guard,
  original bytes are replaced. On final seven-file source, original bytes remain,
  exactly two provider calls occur without retry/follow-up, child/parent receipts
  remain unknown/unverified and CLI EOF exits 0. Fourteen source hashes are
  unchanged during this final replay; parent checks their current-byte identity.
  Exact final receipt: `run-FVCa40/result.json`; review: `REVIEW-v2.md`.

These are source-runtime/private-fixture checks, not owner-account, paid-model,
native UI, packaged or installed acceptance. Provider replies and permission
choices are scripted; the actual CLI, transport, file tool and Rust gate run.

## Remaining boundaries and next action

The real pending ACP permission promise still waits for a client response after
Cancel (502 ms observed before releasing the fixture response). Preventing a late
write does **not** establish prompt settlement while the client withholds it.
Next: cancel/remove only that turn's pending permission request, prove no-response
settlement, ignore stale replies and preserve another session's approval.

Sibling-on-failure cancellation, other direct spawn adapters, already-running
external effects, hooks/retry coverage, full review-clear and owner-account
acceptance remain open. Unit swarm cancellation is not a real multi-sibling test.
Explicit background approval has source conversation evidence, not full ACP/native
background-lifecycle acceptance. Do not remove features or weaken authority gates.

Original work/data/CLI selection/app rollback remain unchanged. Recoverable
preimages, scoped patch and source hashes are retained; no file was deleted.
Roadmap/Trello status, Done contracts, dependencies and shipped history stay intact.
New large packaging/install work waits for disk headroom (about 3.5 GiB available
at this checkpoint); no new notarization, installation, main merge, public tag or
release, CI/paid service or legacy retirement is performed here.
