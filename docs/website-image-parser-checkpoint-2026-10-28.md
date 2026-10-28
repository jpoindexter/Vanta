# Website image-parser checkpoint — 2026-10-28

**Unmerged source repair, not a deployed website or installed app update.**
This follows the [DOMPurify checkpoint](website-sanitizer-checkpoint-2026-10-28.md).

## Change and reachability

Pin only the existing direct `image-size` dependency from 2.0.2 to 2.0.4, plus its
exact lock root/leaf. All 1,489 package records remain; all unrelated records,
ranges and overrides are unchanged. Docusaurus MDX-loader 3.10.2 already declares
`^2.0.2`; this patch needs no override, major upgrade, fork or new package.
The parser's Node minimum becomes 18, within the site's existing Node >=20 floor.

The two advisory records now identify 2.0.3 as the first patched release:
[JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) and
[ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr). Old claims that no fix
exists are historical. Official 2.0.4 tarball SRI and every one of its 118 installed
files were checked in the private candidate. Integrity does not prove maintainer
trust; independent publisher-signature verification is not claimed.

The actual Docusaurus Markdown-image transformer uses CJS `image-size/fromFile`.
The prior 2.0.2 root `disableTypes` state does not govern that separately bundled
fromFile implementation; a harmless valid header demonstrated this distinction.
This is a build-time parser availability risk, not a demonstrated public-browser
or server exploit. The existing signature pre-scan remains a separate defense.

## Evidence

Private frozen candidate: `docs/Vanta-backups/website-image-size-20261028-cH8v0U`.
Parent integration packet: `docs/Vanta-backups/website-image-integration-20261028-smHskd`.
Neither packet is committed as application source.

- Candidate clean locked installation: 1,432 packages, no install lifecycle hooks;
  actual unchanged production build succeeds. Its exact source baseline is
  `5f281d62`, not a new whole-repository build of the later agent checkpoint.
- Fresh parent replays against current `2deeb385` public source plus this patch,
  reusing the private verified dependencies (not claiming another clean install):
  **21 actual parser checks**, **7 actual Docusaurus image transformations**,
  **8 unchanged guard/expiry checks**, and the actual current prebuild pass.
  Fixtures are 16–68 bytes; no old infinite-loop exploit or stress load is run.
- Benign PNG/ICNS/HEIF/JXL fixtures produce exact dimensions. Malformed affected
  fixtures return controlled parser errors. Docusaurus catches those errors and
  emits images without dimensions; this is not whole-document rejection.
- Matched private production lock audit: **42 → 41 package rows**, high 12 → 11;
  critical 18, moderate 3 and low 9 unchanged. Only image-size and its two target
  advisories disappear. Every remaining vulnerability row is deep-identical.
  The additive supplement retains the old missing-audit report unchanged.
- Parent verifies canonical pre/post hashes, the exact manifest/lock whitelist,
  guard bytes, source preservation and the frozen candidate/evidence manifest.

## Unchanged gates and remaining work

Later same-day build follow-up: all 125 current public build inputs were matched
byte-for-byte to `a19a6e16` in the parent private snapshot. The unchanged prebuild
and production build then passed (`current-build-source.json` and
`logs/build-current-exact.log`). This supersedes the initially missing current
full-build check, not the absent browser/deployment or whole-security evidence.

No exception renewal, policy change, guard removal or restoration of guarded
formats occurs. The exception remains expired on 2026-10-01 and fails closed;
the old affected-version assertion is retained for separately reviewed retirement.
The full audit still fails because other advisories remain. This checkpoint does
not remove those findings or the default-branch alerts, nor change card Done gates.

No browser rendering, deployed-site acceptance or installed app/CLI update is
claimed. The production build above belongs to its named private candidate;
the parent reruns bounded current prebuild/parser/consumer paths and the later
current-input production build above. No paid service, CI, main merge or public release/tag.
