# Website compression checkpoint — 2026-10-28

Source-only patch: compression 1.8.1 → 1.8.2 in the existing website lock record.
Only version, resolved, integrity and dependencies.destroy change. destroy@1.2.0
already exists in the lock. All other 1,488 records, manifest, dependency ranges,
parser guards and expired risk-acceptance exceptions remain unchanged.

[Primary advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95) and
[upstream fix](https://github.com/expressjs/compression/commit/151f63e) describe
the early-response-close compressor cleanup repaired in 1.8.2. The actual
webpack-dev-server@5.2.6 caller accepts this patch and enables compression by
default; Docusaurus start does not disable it. No deployed static-site exposure
was established. No dependencies were installed into the canonical website.

## Executed evidence

- Official 7,297-byte archive integrity and all four package files verified.
  Engine, license, entrypoint and middleware contract retained. The 31 old leaf
  files remain in recovery; 42,319 other dependency files/links/modes match.
- Eleven actual loopback HTTP checks match before/after: compressed and identity
  bodies, threshold, HEAD, no-transform, already-encoded response and successful
  new responses following each compressor's early disconnect.
- Three bounded lifecycle regressions reproduce on 1.8.1 and pass on 1.8.2:
  gzip, deflate and Brotli native streams remain open on old response close,
  but are destroyed/closed by the patched middleware before harness cleanup.
  Factories are observed, not replaced by mock streams. Old leftover streams
  are explicitly destroyed only after recording the failure.
- Separate parent replay produces the same eleven compatibility outcomes and
  three old-fail/new-pass results. Both sets of servers bind only loopback and
  close normally. This is not a stress or quantitative memory-leak benchmark.
- Warm production lock-only audit: 41 → 40 package findings; only compression
  removed, all remaining 40 rows deep-identical. Remaining: 18 critical, 10 high,
  3 moderate, 9 low. Audit exits remain 1; no clean audit is claimed. Initial
  39 → 40 advisory-propagation drift remains recorded separately.
- Parent rehashed all 41 frozen evidence files, checked the canonical preimage,
  applied the narrow patch and matched postimage
  `da7acca64c238edeeac32295f6027637e5c213f3e1693036c8a0442bab352857`.

Private packets: `website-compression-20261028-d1yoN6` and
`website-compression-parent-20261028-MHX8dT`. The first proposed patch artifact
had an invalid hunk count; its application check rejected it before any canonical
edit. The corrected artifact and parent-applied patch preserve that history.

Not run: full new website build, deployment, full suite, overall security or
default-main alert clearance. No guard waiver, main merge, public release/tag,
CI, paid service, credential or owner-state change. Installed agent7/normal CLI
remain the previously verified binaries; this leaf does not change them.
