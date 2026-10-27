# Compatible cache maintenance and Vary hardening

## Gap first

The disputed max-stale behavior is unchanged. Do not mark that security
disposition resolved merely because version4.3.0 falls outside an advisory
range. This is compatible maintenance with one demonstrated Vary correction,
not whole-security closure or an installed-app acceptance claim.

## Exact source and dependency change

Only the existing http-cache-semantics lock node changes4.2.0→4.3.0 (version,
registry URL and integrity). It satisfies make-fetch-happen's existing range;
no manifest, policy, override, other resolution or lifecycle script changes.
Canonical dependencies contain the same new package. Its former directory and
hidden-lock state are backed up outside the repository.

## Executed parent evidence

- Actual make-fetch-happen cache wrapper: combined `Vary: accept, *` incorrectly
  reused before and requires revalidation after. Six caller checks pass,
  preserving ordinary cache matching, differing Accept values, no-cache/ETag
  behavior, no-store/missing-cache-path refusal and existing `shared:false`.
- A4.2 serialized policy remains usable in4.3. A synthetic fake-cookie/max-stale
  fixture permits reuse in BOTH versions. No real HTTP request/cache/account
  was used; no real user disclosure or repair of that reported behavior proved.
- Targeted dependency tree exits0 with no problems. Exact lock pre/postimages,
  official tarball integrity and one-node whitelist are retained externally.
- Parent fresh production lock audit changes17→13 (5high→1high, moderate4/low8
  unchanged). Vite is still high. The cache and three propagated rows vanish by
  numeric version classification; the max-stale fixture above is still unchanged.
  Raw receipt: `desktop-cache-production-audit.json` in the parent packet.

The upstream advisory and maintainer disagree about the reported premise:
[advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp),
[maintainer discussion](https://github.com/kornelski/http-cache-semantics/issues/56).
The published diff changes Vary handling, not the named max-stale path. Keep
that distinction in the roadmap and Trello regardless of audit count.

Evidence: `Vanta-backups/scoped-integration-20261027-4TCvWX/cache-proof/` and
frozen `desktop-cache-20261027-F9BJRu`. No new installer, native optional-module
installation, shared proxy, live account, full suite or security acceptance
was executed in this narrow cache slice.
