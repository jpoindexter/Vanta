# Saved approval cancellation — 2026-10-28

Source checkpoint on the unmerged integration branch; not an installed update or
public release. Normal CLI remains pin05271e95/runtime4036609c; installed Desktop
remains agent6/d6260ace. Original work, owner state and recovery copies are retained.

## Reproduced cause and change

The prompt checked cancellation around an awaited save, but the shared queued
rule writer did not check its originating request before publication. Four
initial real-storage regressions failed: canceled TUI/Desktop Always/Never
choices changed the saved rules; Desktop Always also returned approval.

Independent review found two related gaps. Timestamp request IDs could collide
when a canceled prompt was immediately replaced. The outer safety-gate Ask did
not forward the actual turn signal. Two additional regressions through real
`runTurn` and the TUI/Desktop hosts failed before that signal was forwarded.

The shared writer now uses an exclusive private temporary file and checks the
request lifetime immediately before synchronous atomic rename. The queue and
both hosts carry that lifetime. Desktop pending requests settle once, remove
their cancellation listener and use unique IDs; old requests cannot dismiss or
approve a newer prompt. Worker approval uses the same managed lifetime instead
of a separate cancellation race. Outer dispatch forwards the turn signal without
rebinding explicitly detached inner work.

## Executed evidence

- 180 focused checks across 19 files pass, including 15 new storage/host/turn
  regressions and the existing architecture suite. These are not a full-suite run.
- Runtime typecheck and the actual startup compiler pass.
- The compiled production turn, real approval HTTP handler and real filesystem
  pass in a private loopback profile: cancellation while a real temporary write
  is held returns an error, executes no tool, retains exact rule bytes and
  rejects replay. A new exact approval persists the project preference and runs
  one fixture action; a later turn reuses it without another prompt. Fresh
  approval restrictions and an unrelated Never rule remain enforced.
- A frozen-clock test sends an old ID through the real handler and gets 404,
  leaving the newer prompt active. Separate post-publication tests retain the
  already-committed preference when cancellation arrives immediately afterward.
- Independent source review accepted the final bounded repair. Changed
  production files pass strict size/complexity analysis without a baseline waiver.

Private evidence packet: `saved-rule-cancel-20261028-GX0V0g`, including
`outer-red.json`, `final-result.json`, `compiled-http-proof.mjs`,
`compiled-http-result.json`, preimages and the preservation/size manifest.
The initial four-failure reproduction is also retained in the execution record.

## Limits and next delivery

Cancellation observed before publication prevents that save. Cancellation after
publication does **not** revoke or restore an earlier snapshot over a legitimate
saved preference. The current action can still stop. The process-local queue
does not establish cross-process read/modify/write transactions, fsync crash
durability or protection against external writers.

The compiled HTTP replay uses fixture model, kernel assessment and tool; it is
not a new real-kernel, PTY, installed Electron, native-control, live-account or
owner-profile acceptance run. No permission policy, protected Rust/factory file,
credential, approval migration, main merge, public release/tag, CI or paid
service changed. Existing project/fresh/one-time restrictions and kernel Block
remain covered by focused checks, not a new kernel-policy implementation.

Next: freeze a verified delivery commit, prepare an independent CLI pin and
signed/notarized Desktop candidate, then run the exact bundled and installed
chat/restart/approval paths with rollback retained. Broader card Done contracts,
dependency security, modularization and owner visual/parity/human gates stay open.
