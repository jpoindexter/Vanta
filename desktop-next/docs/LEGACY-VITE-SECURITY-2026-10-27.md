# Legacy developer Vite boundary repair — 2026-10-27

## Limits first

This is a source/dependency security checkpoint, not an installed app update.
The ordinary legacy developer server still has an inherited optimizer/close
failure; that behavior is not repaired or hidden here. The new Desktop uses
its separate Vite 8.3.3 tree. Whole security, design and owner acceptance stay open.

## Minimal compatible change

Only the runtime lock's `node_modules/vite` version, resolved URL and integrity
change: 6.4.3 to 6.4.4 within the existing manifest range. No nodes are added or
removed; dependency, peer, engine, script and production-package records stay
unchanged. The published tarball integrity was verified before replacing the
local dependency. Original lock and installed dependency bytes are recoverable.

The official advisories identify 6.4.4 as patched for the
[outside-root file boundary](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)
and [custom HTML transform](https://github.com/advisories/GHSA-9jrq-w75r-8gcw).
These are development-server prerequisites, not a demonstrated installed-app exploit.

## Parent-executed evidence

- On the actual canonical dependency, a synthetic loopback reproduction first
  served an owned outside-root fixture (HTTP 200). The patched request returns
  403 without that content; ordinary HTML remains HTTP 200.
- The actual HTML transform first emitted a foreign script URL. The patched
  transform produces an internal URL; no request to the foreign host was made.
- Both fixture servers close and their processes exit 0.
- The real legacy renderer production build exits 0; its existing large-chunk
  warning remains. Fourteen focused runtime tests pass on Vitest 4.1.12 with
  the patched Vite. The scoped dependency tree exits 0.
- Fresh runtime all-dependency audit: six high to five high; production audit:
  zero to zero. This is not the Desktop, website or GitHub default-branch audit.

The private parent packet `legacy-vite-parent-20261027-RJnp5Z` retains exact
preimages, dependency rollback, before/after behavior JSON, build/test outcomes
and complete audit/tree records. The separate candidate packet retains the
published tarball, integrity record and unchanged-config legacy failure evidence.

## Not checked or resolved

The candidate's ordinary legacy config serves its three startup routes, but
both baseline and patched versions emit unsupported-destructuring optimizer
errors and exit 13 while closing. No optimizer disabling, target workaround or
vendor patch was applied. No full suite, Windows/editor, installed/native,
all-ecosystem audit, or complete test-framework migration acceptance is claimed.
Five runtime development findings and twelve Desktop production-lock findings
remain in their separate inventories. Installed archive2/code `2d31393f` is unchanged.
