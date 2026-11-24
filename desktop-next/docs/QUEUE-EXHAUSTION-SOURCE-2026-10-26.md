# Background queue exhaustion — preserve the rejected request

## Boundary

Source-only follow-on to `655f11b2`. This closes the inherited exhaustion-removal
branch identified in [the cleanup checkpoint](SESSION-CLEANUP-SOURCE-2026-10-26.md),
not whole queue recovery or Desktop acceptance. The installed recovery2 app and
the external 110-file custody candidate remain unchanged.

## Reproduced cause and correction

The existing background drain interpreted exhausted handoffs plus no sidebar
row/owner hint as permission to delete the first queued request. Missing server
state cannot authorize discarding unsent work, even if absence is confirmed.
Actual source Electron reproduced the first request disappearing while a second
remained, with zero model calls. Two regression cases failed for rejection and
transport error.

Removed that deletion branch and its unused existence/projection imports.
The existing four-attempt budget, persisted failure count, quiet localized
still-queued notice and success-only dequeue remain. No new UI, strings,
dependency, retry policy, automatic recovery action or approval behavior.

## Executed evidence

- Focused background drain, preservation and queue store: **58 checks/three
  files** pass. The first post-change test run asserted a transient notification
  after advancing its clock by a minute; it correctly expired. The final test
  checks the notice before that advance and separately proves no further retry.
- Renderer typecheck and renderer/main/preload build pass. The changed
  production file has no new/worse size findings against the unchanged baseline
  (three inherited). Source change deletes substantially more code than it adds.
- `tools/proof/queue-exhaustion-retention.mjs`: actual integration-source
  Electron/private home/loopback provider, **three checks** pass across two
  launches, zero renderer errors and zero model requests. Four rejected
  background handoffs retain both exact request payloads/IDs in order. The first
  retains `drainFailures: 4`; the second is untouched. Automatic retries stop,
  and the same queue/counter survives cold restart without replay.
- The actual pre-change failed result and both unit failure logs are retained
  beside final evidence under `Vanta-backups/queue-retention-20261026-yMzRNV/`.
  This fixture deliberately introduces a live queue; unlike the prior cold-start
  fixture, its retry attempts are the behavior under test.

## Remaining gates

This does not establish delivery to a live provider, behavior after an unknown
external effect, native attachment custody, missing-chat recovery/navigation,
cross-profile/HUD/concurrent ownership, OS clipboard, hardware, owner acceptance
or the exact installed app. Pending requests remain recoverable data, not a
claim that a deleted chat can resume.

Continue the full Desktop delivery goal. Reconcile this deletion into a new
copy of the frozen wider candidate without dropping its native-custody guards;
do not reintroduce the old branch from that packet. No card/status/Done/
dependency change, main merge, tag/release, paid services, CI, protected-source
edit, legacy capability deletion or owner visual/parity gate bypass.
