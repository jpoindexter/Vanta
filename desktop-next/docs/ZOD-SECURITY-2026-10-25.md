# Desktop bounded-collection parsing — 2026-10-25

Delivery follow-on: exact745629c6 build with this dependency is now installed
and passed its chat/restart/Find acceptance. PARALLEL-DELIVERY-2026-10-25.md
holds identity/proof; those journeys are not all schema consumers or complete
denial-of-service acceptance. The package-level regression below remains narrow.

Desktop Zod4.4.3→4.6.7; runtime Zod3/OpenAI5 remains unchanged. Only the real
Desktop manifest pin, its lock owner entry and the hoisted Zod package change.
No forced override, API migration, new quota or capability deletion.

The [4.6.6 upstream fix](https://github.com/colinhacks/zod/releases/tag/v4.6.6)
checks array/set/map size bounds before parsing elements;4.6.7 is its same-major
follow-on. Actual consumers include23renderer and13Electron import sites:
HTTP/SSE/project/config schemas and native bridge requests. Examples with
bounds are quick-entry sessions and file-dialog properties. Unbounded schemas
remain unbounded; this does not establish general denial-of-service safety.

## Isolated executed evidence

- Public bounded-array regression: old4.4.3 parses8elements despite max1;
  new4.6.7 rejects before parsing any element and preserves the normal
  one-element transform. Eight safe strings, no stress/OOM or external input.
-12renderer and60native consumer tests pass; renderer/Electron tsc exit0.
- Clean npm ci --ignore-scripts passes. Direct Desktop and assistant-ui both
  resolve the same hoisted4.6.7 package.
- Audit29→28,0critical/14high/6moderate/8low: only Zod disappears, no new
  findings. Combined with concurrently,31→28, not zero.

An initial nested install left assistant-ui resolving old Zod; NOT accepted.
Broad npm dedupe changed unrelated packages; rejected and scratch restored.
The accepted lock changes only owner/root metadata using official registry
tarball integrity, then validates through clean npm ci. Historical lock-only
tests-js/ui-tui/web entries have no manifests in this snapshot and are not
invented or altered. npm integrity verification alone is not provenance proof.

Upstream release notes disclose a reverted Git credential compromise and say
those commits were not published to npm. Separate npm10.9.8 audit signatures
for the production Desktop workspace exits0, invalid[]/missing[], no stderr.
Its verifier checks signatures AND attestations. Official4.6.7 SLSA provenance
names colinhacks/zod release.yml at b500a2ee95134f81d74da7911d7378dd2853d042;
official tag resolves to that exact commit and attested SHA512 matches the
candidate lock. This is provenance/identity evidence, not proof of benign
source or whole-security acceptance. No new verifier dependency was installed.

Isolated snapshot/proof: Vanta-backups/concurrently-security-candidate-20261025-x9O06E,
ZOD-SECURITY-TRACK-2026-10-25.md; fresh audit receipt under
`proofs/zod-security-2026-10-25/audit.json`.
No packaged/installed, full-suite, owner-profile or whole-security acceptance.
