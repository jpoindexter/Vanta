# Website shell-quote leaf — 2026-10-28

## Verdict and scope

Source-only dependency checkpoint: update the existing website lock entry from
shell-quote1.10.0 to1.11.0, compatible with launch-editor's declared `^1.10.0`.
Only that entry's version, archive URL and integrity change. No manifest,
override, audit exception, runtime/desktop lock, installed dependency tree,
application binary, website deployment or default branch changes.

The [maintainer advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)
identifies1.11.0 as the fix for line terminators after comment tokens in
`quote()`. The recorded website caller is launch-editor's explicit-editor
`parse()` branch, reached through the development-server toolchain. No exploitable
Vanta `quote()` route was demonstrated. npm's production classification does not
establish that this development path ships in the static public website or app.

## Executed proof

- Verified official fixed archive integrity against the prepared lock value;
  archive SHA-256 is
  `028be526afacb2bf5c6c008a95d5435b5d205135f68bb48afd0bb947610393f1`.
- Eighteen checks through the actual launch-editor caller and its resolved
  shell-quote module: ten editor-string cases, four ordinary quote/parse
  roundtrips, and rejection of four line-terminator variants after comments.
  The old-version control fails; the1.11.0 fixture passes. No shell command or
  native editor was launched.
- Retained before/after branch comparison additionally records ANSI-C tab
  expansion, a double-quote/backslash control, special-variable boundaries and
  underscore-prefixed variables. These are intentional parser corrections, not
  a claim of identical output for every previously accepted input.
- Fresh paired production/all, lock-only npm audits:35→34 package findings,
  critical17→16. Only shell-quote disappears; every other advisory row is equal.
  All four audit commands exit1 because findings remain; that is not an audit
  execution failure or a security-clean verdict.

Reusable check, after installing the tested lock in an isolated website checkout:

```sh
node scripts/shell-quote-regression.cjs
```

An explicit fixture-root argument can exercise another installed tree. It still
only invokes the pure explicit-editor parser; it never discovers or starts an
editor. Receipt packet: `dependency-shell-promotion-20261028-c06BxM`.

## Remaining boundaries

Thirty-four website findings remain, including16 critical findings. The existing
image-size audit-exception review date is expired; it was not extended or waived.
GitHub default-branch alerts require their own default-branch reconciliation,
not inference from this integration-branch lock change.

No full website build, native editor launch, dependency installation in the
canonical checkout, app rebuild/install, production deployment, full application
suite or cross-platform proof ran for this leaf. Desktop delivery/Gmail consent,
the broad dependency/security goal and original owner acceptance gates remain
open. Existing work and rollback must remain intact.
