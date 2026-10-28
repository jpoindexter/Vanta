# Foreground swarm containment — 2026-10-28

## Status and boundary

This is a source checkpoint, not a new installed version. The installed agent5
app and normal CLI still contain `166aff7f`; their separate acceptance record is
[agent5 delivery](agent5-installed-2026-10-28.md). No main merge, tag, public
release, deployment, credential migration or policy relaxation is included.

The bounded Done criterion is: after a foreground child reports an uncertain
effect, its pending siblings settle without starting later actions or accepting
late approval; ordinary success and a read-only iteration limit must not cancel
independent siblings. A canceled TUI prompt must not grant task authority or
dismiss a newer prompt when its stale choice completes.

## Cause and smallest repair

- `swarm` formerly waited for all workers without containing siblings after an
  uncertain child outcome. It now uses one invocation-local cancellation signal,
  combined with the parent turn. `needsEffectReview` or an exception after spawn
  starts cancels siblings; provider setup failure alone does not.
- Nested approval wrappers formerly replaced the child's lifetime with the
  parent's lifetime. They now combine both: a child may tighten a foreground
  approval, but cannot detach it. Explicit background delegation remains separate.
- The TUI approval bridge formerly ignored cancellation. It now settles denial,
  removes its listener, and clears only its own pending prompt. Stale task,
  Allow, Always and Never choices cannot approve an action or dismiss a newer
  prompt. Existing saved-rule, fresh-approval and each-time policies remain.

No new dependency, tool, global controller, kernel policy or grant scope was added.

## Executed evidence

| Path | Observed result | What this does not establish |
| --- | --- | --- |
| Before/after real compiled CLI, actual registered `swarm` and unchanged Rust kernel | Old source starts sibling B's file write after A's partial shell effect. New source retains A's partial marker and unknown receipt, but never starts B's late write. | Not an external-account or MCP-server replay. |
| Pending child approval, then uncertain sibling | New source settles before a client reply; a late offered one-time Allow changes no file. A later probe still asks and its rejection preserves bytes. | Does not prove every adapter or remembered-rule race. |
| Parent Cancel with held provider and approval | Turn settles; releasing both afterward creates no partial marker or later file. | Does not undo already-started effects. |
| Both-success and read-only iteration-limit controls | Independent B completes normally. The limited read-only aggregate remains conservatively unverified. | Not arbitrary concurrency or workflow acceptance. |
| Real Ink rendering with simulated terminal input | Stale Always/Never keys and an in-flight Always completion cannot approve or dismiss the newer prompt. | Not an installed, real-TTY multi-worker acceptance run. |

All five final CLI cases ran sequentially against frozen source, each with a
private profile/project and loopback scripted provider. Each CLI reached natural
EOF with exit 0; only the fixture-owned kernel was terminated afterward. Kernel
SHA-256 remained `0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`.
Provider fixtures prove control behavior, not research intelligence.

Focused checks: 49 agent/approval tests across seven files and 49 TUI tests across
six files pass. Runtime typecheck exits 0; architecture checks pass. Strict size
analysis finds no violations in the five production files or four other changed
test files. The pre-existing 95-line test-suite wrapper is unchanged in size; it
is recorded, not waived or described as zero debt. No full application suite ran.

Private replay/RED/GREEN receipts, exact source hashes and before-images are in
`swarm-containment-20261028-sbgvcy`; TUI receipts and frozen hashes are in
`tui-approval-cancel-20261028-w6RoxH`. These retained local packets are not public
repository attachments. Independent final review found no additional blocking
defect in the exact production diff.

## Retained failures and unresolved limits

- A parallel source replay failed before any provider call because a generated
  startup-cache module was missing during rebuilding. Final frozen, sequential
  replays pass. The concurrency/cache failure is retained, not claimed fixed.
- Initial fixture failures included an incomplete test mock, a missing private
  Ask rule, an assumption that a remembered choice was offered, and incorrect
  identification of a later generic approval prompt. Corrected fixtures use only
  the actually offered one-time choice; no production boundary was weakened.
- Cancellation after an Always/Never storage write has already started cannot
  roll that write back. The action remains denied and a newer prompt remains,
  but transactional saved-rule cancellation is not implemented by this slice.
- Swarm containment starts when the child outcome reaches `swarm`, after child
  persistence and stop hooks. It is not an atomic global halt or compensation
  for effects already started. Independent parallel approval queuing is not
  accepted by this checkpoint.
- Installed CLI/TUI and new packaged-app acceptance, full review-clear behavior,
  owner-account workflows and broader security/parity gates remain open.

## Preservation and next step

All 239 original integration-file hashes and 13 original dirty CLI-file hashes
still match. Existing source work, app/CLI selections, signed recovery installers
and rollback copies are retained. Recoverable cleanup is separately recorded in
[old-build cleanup](old-build-cleanup-2026-10-28.md); observed disk space is now
about 51 GiB, not a claim that this cleanup alone reclaimed that amount.

The canonical roadmap IDs, statuses, Done criteria, dependencies and shipped
history are unchanged. TRUST-03 and OP-03 remain Building; Desktop cutover retains
its owner/parity gates. Next: execute the real private TTY approval flow, then
deliver this exact checkpoint through a new verified CLI pin and packaged app.
