# Website editor dependency — 2026-10-28 source checkpoint

The website lock now selects compatible **launch-editor 2.14.2** instead of
2.14.1. Exactly four fields change in one existing record: version, archive URL,
integrity and its official shell-quote dependency range. The already-resolved
shell-quote 1.10.0 satisfies the new range. All other 1,488 records, root manifest,
guards, overrides and acceptance exceptions remain unchanged.

No canonical dependency installation, website build or deployment is performed.
The selected CLI and installed Desktop do not change with this source checkpoint.

## Cause and real consumer

[GHSA-r825-w8mm-5pxw / CVE-2026-112944](https://github.com/advisories/GHSA-r825-w8mm-5pxw)
describes editor argument confusion, patched in 2.14.2. An existing relative
filename beginning with `+` or `-`, an accepted editor-opening request and a
susceptible editor are required. Passing that path directly can make Vim treat
it as a command instead of a file; the patch resolves it to a literal absolute
path. These prerequisites were exercised only in a private fixture.

Actual webpack-dev-server 5.2.6 calls this package from its editor-opening HTTP
middleware. Its `^2.14.1` range accepts the patch. Official registry metadata,
the 9,974-byte archive, SHA512 and all 16 package files were verified; entrypoint,
engines and MIT license remain compatible. No replacement route or mocked
editor interpretation supplies the regression evidence.

## Executed evidence

- Actual loopback HTTP → webpack-dev-server → launch-editor → headless system
  Vim reproduces command interpretation before the patch. The identical
  filename after the patch is opened as a literal path without writing the
  private marker. No vulnerable request reaches an owner file or editor.
- Five controls per version pass: ordinary path, spaces, absolute `+` path,
  absent file, and a browser cross-site request rejected using Sec-Fetch-Site.
  Owner startup configuration, plugins, swap and Vim history are disabled.
- A separate independent replay reproduces old failure/new success and all ten
  controls. All eight owned Vim children exit 0; both server/compiler lifetimes
  close and refuse subsequent connections. No wrapper remains.
- All 103 frozen evidence entries, official archive bytes, exact four-field
  delta, unchanged caller files and compatible already-resolved shell-quote
  are independently rechecked. The canonical lock matches the tested postimage:
  SHA256 `e78166a5bcb77e5bdea66f11899d46c763f64cc7a5b623ffb1ede238ce288178`.
- Matched warm lock-only website audits **39 → 38** remove only launch-editor.
  All other 38 rows remain deep-identical: **17 critical, 9 high, 3 moderate,
  9 low**. Both audits still exit 1; overall dependency security is not green.
- A separate fresh runtime production-lock audit returned zero known findings.
  That database result is not a runtime code audit or whole-security clearance.

Private evidence: `dependency-next-agent9-20261028-8nJLeU`,
`dependency-independent-editor-20261028-ZljzLc`, and
`launch-editor-promotion-20261028-giQMHh`. Original preparation/control failures
remain recorded. Cold audit-count drift is not counted as a repaired issue.

## Unresolved boundaries

An Origin-only request returned 200 under the fixture's allowedHosts setting;
this patch does not fix or fully characterize that policy. Two Windows/WSL
advisories disappear from the package's audit row but were not executed on
Windows. No ordinary/deployed Vanta exploit or static-site exposure is established.

No full website build/deployment, owner editor/profile, default-main alert
reduction, full suite, app delivery or public release is claimed. GitHub's
default-branch inventory is distinct from this unmerged integration lock.
No whole-card promotion, guard waiver, protected-source change, main merge,
public release/tag, CI, paid service or legacy retirement.
