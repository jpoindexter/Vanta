# Compatible XML tooling repair — 2026-10-27

## Scope and limits

Source/dependency checkpoint, not an installed update or strict XML policy
closure. The installed Home app remains code `feea5a4f`, version
`0.1.0-local.20261027.home1`; it was delivered before this change.

Only six fields in two existing runtime-lock nodes change: root xmldom
0.9.11→0.9.12 and app-builder's nested xmldom 0.8.14→0.8.15, each version,
resolved URL and integrity. Existing plist consumer ranges accept these patch
versions. Root manifest, package inventory, engines, production records and
capabilities are unchanged. No overrides, vendor patches or caller-policy changes.
Published tarball SHA512 integrity and exact pre/postimages were checked;
both original dependency directories and the hidden installation lock are retained.

Official advisories document the patched [malformed end tag](https://github.com/advisories/GHSA-6h8r-xr42-gp59),
[strict entity serialization](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6)
and [namespace-memory](https://github.com/advisories/GHSA-965w-775f-mr7g)
issues. No stress test or installed exploit was executed.

## Parent-executed evidence

The parent ran the same 14 bounded checks before and after against the actual
canonical dependency tree, not the worker's replacement tree:

- Both parser lines now report the tiny malformed end tag instead of silently
  accepting it. This proves diagnostics, not mandatory rejection by callers.
- Strict serializers reject invalid processing-instruction/entity markup; default
  permissive serialization remains explicitly unchanged. Correct version-specific
  serializer argument positions are used; no Vanta strict-serializer use is inferred.
- Both actual plist lines round-trip bundle metadata, escaped strings, booleans,
  arrays and data bytes; eight ordinary namespace elements still parse.
- Actual app-builder file save/read and native-run's in-memory plist protocol
  reader pass. No network, socket, device or owner configuration was used.

Three additional actual default-caller observations—root plist, nested plist
and app-builder file parsing—**still recover malformed XML after reporting an
error**. The upgrade does not make those callers fail closed. A future strict
application policy needs separate compatibility and failure-path work.

The scoped installed dependency tree and full runtime typecheck pass. Fresh
same-snapshot runtime all-dependency audit: **four high→three high**;
production-only remains zero. Remaining runtime rows are cache semantics,
source-map-js and undici. These are not the separate Desktop, website or older
GitHub default-branch inventories; no whole-security-green claim follows.

Evidence: `xmldom-parent-20261027-aoE2io` retains parent before/after caller
results, recovery observations, fresh audits/tree/typecheck and canonical rollback.
The reviewed frozen proposal remains in `xmldom-20261027-z235Rx`, including
official metadata, advisories, tarballs and independent evidence. Source lock
postimage SHA256:
`d9b48b79067cb2d8ae93cc5210d9f5a5eddd57ed62c83001454cee6915faca40`.

No full suite, whole application build, package/sign/install, owner/account
operation, protected source edit, roadmap status promotion, main merge,
public release/tag, CI or paid service occurred for this patch.
