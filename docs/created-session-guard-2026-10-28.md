# New chat/fork navigation and activity reads — 2026-10-28

Verified source checkpoint, not installed delivery. The normal CLI and signed
installed agent7 remain the [previous exact local delivery](agent7-installed-2026-10-28.md).
No whole Desktop, security, modularization, visual or parity acceptance follows.

## Cohesive guard extraction

The created-session route guard moves from use-session-actions/index.ts into
feature-local use-created-session-guard.ts. The parent still owns session creation,
fork actions, state publication and the externally supplied creatingSessionRef.
The new hook owns its pending ID, origin route, timer and settlement only.

Preserved: three-second deadline, replacement timer cancellation, captured-route
comparison, selection-only settlement, retry navigation, caught navigation errors
and unmount timer cleanup. Both create/fork finally blocks read a stable live
pending getter, not a render-time boolean. No new owner-ref reset on unmount,
global state, runtime permission, configuration or dependency.

The index decreases 3,328 → 3,245 lines. The new module has 110 lines and zero
strict size findings; 22 pre-existing index findings remain, none worsened.
This is one complete responsibility extraction, not whole-app modularization.

## Real replay found an existing activity race

The first extended source Electron replay completed New chat Alpha/Beta, Branch,
child continuation, switching and cold restart, but failed zero-error acceptance:
a message activity subscriber read `.message.content` after its thread became
empty. A separately copied pre-extraction renderer reproduced the same error.
Both failed results and full console-versus-page-error stacks are retained.

An ID-primitive candidate passed small fixtures but failed the actual app with
a missing-key error and workspace fallback. It was rejected and restored
byte-for-byte before publication; no dependency or error-boundary edit remains.

The actual repair stays in TurnActivityIndicator: each of its three selectors
checks for a nonempty thread before dereferencing the old message. Empty snapshots
return neutral activity/narration/running values. Populated-message behavior,
busy/turn-clock semantics, error reporting and recovery boundaries are unchanged.
This is not a general cure for nonempty stale-index or unrelated lookup failures.

## Executed proof

- Four original parent-hook checks pass before extraction. Four new direct
  checks cover live getter identity/authority, timer replacement, unmount and
  selection-only settlement. Independent review also passes three existing
  branch-retry cases.
- The selector-boundary regression fails before the fix: three removed-message
  dereferences where zero are required. Its populated-thread control passes.
  Both pass after the guard. This is a mocked selector-boundary check, not a
  renderer-race reproduction; it does not replace the real Electron counterexample.
- Three real-runtime transcript fixtures pass empty/suppressed replacement and
  reorder/window shortening. They also passed before the activity fix and are
  compatibility evidence, not a falsely claimed unit RED reproduction.
- Final focused run: 24 passed, 141 unrelated parent-hook tests skipped, six files.
  Renderer typecheck, source build and five architecture boundaries pass. No
  existing size allowance or policy was widened; four existing status findings
  remain (one additional comment line, no larger functions or added complexity).
- Final rebuilt source Electron replay passes all six checkpoints: Alpha/Beta
  distinct chats, actual UI Branch copying exact transcript/cwd, independent child
  continuation, switch away/back without duplicates or parent mutation, cold
  restart with exact three histories, and zero renderer errors over both lifetimes.
  Exact source inputs and renderer/main hashes are recorded; private kernel ports
  close after each run.

The source Electron replay uses private profiles and a loopback canned model with
the maintained 2d739e68 runtime pin through the ordinary source launcher (TSX
fallback), verified kernel `0a8511a6…`. The unrelated canonical debug kernel was
neither used nor overwritten. This is deliberately not a packaged/installed app
proof, owner-provider trial or live-account/native-control acceptance.

## Preservation and next delivery

Private recovery packets: `created-session-guard-20261028-2LOKWc` and
`session-actions-electron-20261028-NOvQGv`. Preimages, generated build outputs,
failed candidate patch, failed/green results, private profiles and screenshots
remain recoverable. Original work and owner data remain separate.

One additional gap is confirmed: backend fork copies history but does not persist
the parent linkage. The successful history replay does not establish durable tree
lineage. That requires its own scoped change and proof; it was not silently fixed
or presented as complete here. Whole roadmap cards retain their statuses/Done.

Next delivery: package this source after the checkpoint, sign/notarize/staple,
check the exact candidate, guarded-install with agent7 rollback, then replay the
installed copy. No main merge, public release/tag, CI, paid service, protected
Rust/factory/MANIFESTO change, credential migration or legacy retirement.
