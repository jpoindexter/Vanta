# Website Colord checkpoint — 2026-10-28

Source-only change to the existing `node_modules/colord` lock record:
2.9.3 → 2.9.4, version/resolved/integrity only. The manifest, all other 1,488
lock records, dependency ranges, parser guards and exceptions are unchanged.
No dependencies were installed into the canonical website, and no site was deployed.

[The primary advisory](https://github.com/advisories/GHSA-2wm5-q62r-hmrv)
identifies a moderate malformed-color parsing issue fixed in 2.9.4. The observed
callers are PostCSS color/gradient build plugins, both accepting `^2.9.3`.
No attacker-controlled deployed/static-site path was established.

## Executed evidence

- Official archive integrity and all 67 new package files verified. Original
  44-file leaf retained unchanged. CJS/ESM/plugin exports, condition ordering,
  license and dependency/engine contract are compatible.
- Nineteen actual PostCSS/color/gradient/import checks pass before and after,
  with identical results. A separate parent replay passes the same 19 checks
  against each private dependency tree without modifying the frozen worker packet.
- Matched warm production audit: 42 → 41 findings; only Colord removed and all
  remaining 41 advisory rows deep-identical. Remaining: 18 critical, 11 high,
  3 moderate, 9 low. Both audits correctly exit 1 because findings remain.
- Initial 40 → 41 propagation drift is retained separately; it was not silently
  represented as an upgrade regression or an overall clean audit.
- Parent independently rehashed all 32 frozen evidence files, confirmed the
  canonical preimage, applied the three-field patch and verified exact postimage:
  `bb85ea9dbf04fa6aa1c377f6092e196633555ca23b353b369aebe128cee7294b`.

Private evidence packets: `website-colord-20261028-xb9eil` and
`website-colord-parent-20261028-IxVIEw`. Recorded source-shape validation observes
the updated numeric matchers; tiny fixtures are compatibility evidence, not an
asymptotic performance proof. No stress payload, full new website build, deployment,
whole dependency/security clearance or default-main alert reconciliation was run.
This website lock change does not alter the delivered CLI/Desktop agent7 binaries.
