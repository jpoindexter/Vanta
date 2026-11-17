# Foreground worker outcome custody — 2026-10-27

Source checkpoint, not an installed or whole-agent acceptance claim.

## Cause and change

`delegate` and `swarm` reduced child outcomes to text and always returned success.
The child loop already retained uncertain effects correctly; its parent-facing
adapters discarded that truth. Both now use one small outcome adapter. An
uncertain, incomplete or contradictory child result remains non-success and
unknown/unverified; a successful sibling cannot clear that state. Ordinary child
completion still returns its summary without turning it into verified evidence.
The existing delegation ledger uses the same completion predicate.

The unchanged MCP mount setup is extracted within delegate to satisfy the source
size limit. Its kernel, fresh approval, session and permission-mode fields remain
unchanged. No tool, dependency, authority or orchestration framework was added.

## Executed evidence

Parent packet: `child-outcome-parent-20261027-tPldDu`. Frozen worker packet:
`child-result-propagation-20261027-BckXfF`; patch SHA256
`094b803ec1340c3eb318d4635d21fcb953ae468e7ff5eb2dc3f78755b046e960`.

- Parent ran 37 focused checks across five files and runtime typecheck. Actual
  parent turns call the production delegate/swarm adapters and real spawned child
  conversations: an uncertain child stops the parent before a second provider
  call or later batch tool; ordinary success remains usable. Child usage and
  raw sidechains remain separate from the parent's usage.
- Regression coverage includes a misleading done/review-required outcome, no
  false pass in its delegation ledger, and a child exception after a local file
  effect. Strict size checks pass for all five changed source/test paths.
- Independent packet `foreground-child-review-20261027-SImnDK` ran a mixed swarm
  against the exact production hashes now integrated. Both children write/read
  their private fixtures; the unknown child remains dominant. Parent model calls
  stay at one, its later write stays at zero, and both sidechains retain usage.

These use deterministic providers and injected private safety/spawn gates, not
owner accounts or actual Rust-policy acceptance. The independent mixed-worker
journey was not rerun by the parent; exact source identity was checked. Original
239 integration work-file hashes remain unchanged.

## Limits

Without aggregate child-effect certainty, incomplete workers are conservatively
held for review, even where no effect may ultimately have occurred. This is not
a false no-effect assertion or automatic retry. Already-running parallel siblings
are not cancelled or rolled back. Parent-to-running-child cancellation and
detached/background re-entry require separate proof; this foreground patch does
not fix them. No whole roadmap card is closed by these bounded fixtures.
