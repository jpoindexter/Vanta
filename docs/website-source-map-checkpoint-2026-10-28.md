# Website source-map checkpoint — 2026-10-28

**Source-only security repair, not a deployed website or installed app update.**

Only the existing `source-map-js` lock leaf changes from 1.2.1 to 1.2.2: version,
official archive URL and integrity. All other 1,488 package records and the package
manifest remain unchanged. PostCSS 8.5.26 and both existing css-tree consumers
already accept this compatible patch. No new dependency, override or exception.

The [upstream advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
identifies malformed indexed source-map handling as an availability problem.
Reachability here is the actual PostCSS previous-map consumer and CSS build tools;
this is not proof of a remotely exploitable deployed static page.

## Executed proof

Private packet: `Vanta-backups/website-source-map-20261028-uJ2167`.

- Registry archive integrity and all 18 extracted files verified before use.
- RED: actual old PostCSS Input accepts a negative indexed offset, failing the
  expected rejection. GREEN: eight bounded consumer checks pass with 1.2.2,
  including malformed offsets, valid basic/indexed original-source/content
  round trips, both actual css-tree generators and constructor-only numeric caps.
- Parent separately reruns the eight green consumer checks against the genuine
  private dependency copies; no source implementation or response is mocked.
- Matched warm production lock audits: **43 → 42 package findings**, high 12 → 11.
  Only source-map-js disappears; all 42 remaining rows are deep-identical. Remaining
  counts: 18 critical, 11 high, 4 moderate, 9 low. Both audits still exit 1.
- Earlier cold requests returned 41 → 42 as advisory metadata changed between
  requests. Those receipts remain; only the matched warm pair supports the claimed
  one-row reduction. Older website counts are historical, not current clearance.

Canonical website dependencies are not installed. Proof reuses isolated actual
PostCSS/css-tree dependency copies and the verified new leaf; this is not a fresh
locked install or whole-site build. Existing input guards and expired exceptions
remain unchanged and unwaived. No SourceNode expansion or stress workload ran.

No deployed-browser check, default-branch alert reconciliation, complete security
clearance, app/CLI installation, main merge, public release/tag or CI is claimed.
The [earlier image-parser checkpoint](website-image-parser-checkpoint-2026-10-28.md)
retains its own exact build/version evidence and does not certify this newer lock.
