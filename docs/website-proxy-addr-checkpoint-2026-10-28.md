# Website proxy trust dependency — 2026-10-28 source checkpoint

The website lock now selects compatible `proxy-addr` **2.0.8** instead of 2.0.7.
Only version, resolved URL and integrity change in one existing lock record.
All other 1,488 records, root manifest, parser guards and risk-acceptance
exceptions remain unchanged. No canonical dependency installation or deployment
is performed by this checkpoint; the installed Desktop and CLI do not change.

## Cause and actual consumer

[GHSA-jqcg-44mw-7w3h / CVE-2026-90711](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
describes critical IP-spoofing through incorrect IPv4/IPv6 trust-subnet matching,
patched in 2.0.8. An affected trust subnet may accept an unrelated IPv4 peer as a
proxy and believe its forged `X-Forwarded-For` header.

The installed website dependency graph contains Express 4.22.2, which calls
proxy-addr for `req.ip`/`req.ips` and trust compilation. Its declared `~2.0.7`
range accepts 2.0.8; package dependencies, engine, entrypoint and MIT license
remain compatible. Existing nested `ipaddr.js` is retained unchanged.

**Express defaults `trust proxy` to false.** An affected trust-subnet configuration
was not established in Vanta's ordinary server or deployed static website. This
is an executed conditional consumer regression, not a demonstrated production
exploit or a claim that the agent runtime was affected.

## Executed evidence

- Official registry metadata/archive integrity and five package-file hashes
  verified; source candidate manifest seals 38 evidence files.
- Actual Express HTTP server and socket, not a mocked request/trust function:
  eight compatibility controls agree across versions, including default no trust,
  ordinary/mapped IPv4 trust and legitimate single/multiple proxy subnets.
- Four short-prefix/zero-leading IPv6 cases reproduce forged-IP acceptance on
  2.0.7 and reject it on 2.0.8, covering both single- and multi-subnet predicates.
  All requests are finite loopback fixtures using documentation-only addresses.
- A separate independent replay executes all **24 before/after HTTP cases**;
  all 24 owned servers close and reject subsequent connections. Zero unexpected
  failures. Manifest seals, archive integrity, exact three-field delta, semver
  and nested dependency preservation are independently checked.
- Private dependency clones retain **42,318 other files/links/modes**. Warm
  lock-only production audit **40 → 39** removes only `proxy-addr`; all other
  39 rows remain deep-identical. Remaining: **17 critical, 10 high, 3 moderate,
  9 low**. These audits still exit 1; overall dependency security is not green.
- The applied canonical lock exactly matches the independently tested candidate.
  No install lifecycle scripts or broad dependency rewrite runs.

Private packets: `dependency-next-20261028-KbmKOA` and
`dependency-independent-20261028-B8sTxj`. Initial advisory/cache drift and a
preparation check that mistakenly included nested dependency files are retained;
neither is counted as a repaired product regression or caused canonical deletion.

## Remaining boundaries

No full website build, deployment, exposed-server exploit, whole-repository or
default-main security clearance. GitHub default-branch alerts are a different
inventory and are not reduced by an unmerged integration lock change. Earlier
audit counts remain dated historical evidence, not current all-repository totals.

No source guards or exceptions relaxed; original work and recovery retained.
No whole-card promotion, protected-source change, main merge, public release/tag,
CI, paid service, credential change or legacy retirement.
