# Compatible packaging URI repair — 2026-10-27

## Scope and limits

Source/dependency checkpoint only, not a new installed Desktop or security
closure. Fast URI is used by Ajv and packaging validation. These checks do not
demonstrate an installed Vanta SSRF/XSS path or execute a package/sign/install.

Only the runtime lock's `node_modules/fast-uri` version, URL and integrity
change: 3.1.5→3.1.9, accepted by the existing Ajv range. Root manifests, node
inventory, production package records, dependency contracts and capabilities
stay unchanged. The published tarball integrity was verified; the original
dependency and exact source preimage remain recoverable.

The [upstream security release](https://github.com/fastify/fast-uri/releases/tag/v3.1.9)
covers encoded schemes, malformed hosts and relative-reference normalization.
Version-range classification is not evidence of an application-level exploit.

## Parent-executed proof

Ten before/after checks ran against the actual canonical dependency and callers:
malformed-port authority, encoded/legacy schemes, actual Ajv URL resolution,
scheme equality, ambiguous/control-character hosts, ordinary URI resolution,
local schema references, and the real app-builder validation function. Vulnerable
fixtures are rejected or no longer normalized into the unsafe interpretation;
ordinary valid data still passes and invalid data is rejected. No foreign URL
was requested and no owner configuration was read.

Three additional checks use the actual app-builder `scheme.json`: a macOS ZIP
configuration passes, malformed target and unknown field fail. The scoped npm
dependency tree exits 0. Fresh runtime all-dependency audit: five high→four high;
production audit remains zero. Desktop, website and default-branch inventories
are separate, not silently reduced by this source patch.

Private evidence packets: `fast-uri-parent-20261027-5UfJG7` (parent actual
before/after JSON, schema checks, audit/tree and rollback) and
`fast-uri-20261027-DdnMiW` (frozen patch, source pre/postimages, registry metadata,
published tarball/integrity and independent caller proof).

No full suite, full application build, native/installed acceptance or outbound
exploit was run. Remaining runtime development rows are xmldom, cache semantics,
source-map-js and undici. The separate inherited legacy Vite optimizer/close
failure remains. Installed archive2/code `2d31393f` is unchanged.
