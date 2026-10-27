# Compatible source-map tooling repair — 2026-10-27

Source/dependency checkpoint, not an installed app update or executed deployed
exploit. Installed home1/code `feea5a4f` remains unchanged.

Only the runtime lock's existing source-map-js node changes 1.2.1→1.2.2:
version, resolved URL and integrity. PostCSS 8.5.26 and its `^1.2.1` range,
manifest, node inventory, production records, engine and license are unchanged.
No override, vendor patch or capability deletion. Official tarball SHA512 and
source pre/postimages were verified; original leaf and hidden lock are retained.

The [official advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
lists 1.2.2 as patched for unchecked indexed-map offsets. Local proof deliberately
uses tiny fixtures, not expensive mapping expansion or allocation stress.

## Parent-executed actual caller

Six before and seven after assertion groups run against the actual canonical
PostCSS `PreviousMap.consumer()` and its own resolved source-map-js dependency:

- Valid basic/indexed original-source lookup and exact source contents pass.
- A fractional offset accepted before is rejected after through the same caller.
- Single and nested over-cap numeric offsets reject at construction after the
  patch. They are never expanded into millions of lines or mappings.
- Six additional malformed offset forms reject in the patched constructor.
- A real tiny PostCSS transformation still generates a map retaining exact
  original CSS content and line lookup. No owner file or remote URL is involved.

Scoped installed dependency tree and full runtime typecheck pass. Fresh matching
runtime audit: **three high→two high**, production-only zero. Remaining rows
are cache semantics and undici; the separate Desktop/website/default-branch
inventories are not reduced by this narrower result. XML callers' permissive
recovery and the inherited legacy optimizer/close issue remain unresolved.

Parent results, audits, typecheck and exact rollback are retained in
`source-map-parent-20261027-J4OfML`; the frozen independent proposal, metadata,
tarball and proof remain in `source-map-20261027-MKZpnT`. Source lock postimage:
`bf1f60a9589656eb9879345f80646bf557876e279e903647887ec6600c8bf3d8`.

No full renderer/application build, native/installed acceptance, real adversarial
deployment, owner data, main merge, release/tag, CI or paid service was exercised.
The actual tooling caller is proved; whole application security is not.
