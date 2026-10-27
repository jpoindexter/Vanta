# Runtime test-tooling security — 2026-10-27

## Boundary first

This is an integrated source/dependency checkpoint, not an installed Desktop
update or whole-security acceptance. Runtime all-dependency audit findings fall
from nine (two critical, six high, one moderate) to six high. Production-only
findings remain zero. Desktop, website and GitHub default-branch inventories are
separate; no card is closed by this result.

## Smallest compatible repair

Vitest is pinned to 4.1.12. Its 26 changed development-only lock records remove
tinypool and update the matching mocker packages; all 408 production package
records and runtime Vite 6.4.3 remain byte-equivalent as parsed records. Two
existing tests now declare precise spy/callback types, without changed assertions,
casts, suppressions, configuration changes or production implementation edits.

The [official security backport](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12)
repairs [manual mock source injection](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8).
The matching mocker line also repairs the
[redirect file-boundary issue](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9).
Forcing tinypool 2 into Vitest 3 would violate its declared range; no such
override, peer bypass or audit suppression is used.

## Executed evidence

- Private baseline reproduced inherited tinypool worker-option behavior and the
  two public mocker API problems with synthetic files only. These simulate the
  required upstream pollution prerequisite, not a demonstrated Vanta exploit.
- Parent integration ran the real installed package APIs: tinypool absent,
  manual mock injection not executed, outside-root mock file not read; ordinary
  mock generation and allowed inside-root redirect still succeed.
- Parent ran 174 selected tests in 12 files: all pass, none skipped. Selection
  covers exact file writes, registry, remembered approvals, effect gateway,
  grants, providers, terminal/desktop approvals, MCP and both adjusted tests.
- Full runtime typecheck, startup compilation and runtime bundle build exit 0.
  All 340 current emitted files match the private baseline byte-for-byte.
  The canonical output directory also retains 1,317 historical generated files;
  those were not deleted or counted as current outputs.
- Dependency tree exits 0: Vitest/mocker 4.1.12, runtime Vite 6.4.3, no tinypool.
  Fresh parent all-dependency audit reports six high findings, zero critical.
- Private candidate additionally ran the same 174 tests in the thread pool.
  Existing npm 10 installs the final complete lock with lifecycle scripts
  disabled. npm 10 re-resolution failed twice; npm 12 was used only in a private
  cache to resolve the reviewed lock, not installed globally or made required.

## Preservation and limits

All four source preimages, the original complete dependency directory, exact
candidate patch and logs are retained in the private
`runtime-test-integration-20261027-yfHsyQ` packet. The reviewed proposal and
baseline are in `runtime-test-security-candidate-20261027-uGnFlM`. Canonical
production source and original owner work are preserved.

This is a major test-framework migration. The complete runtime suite, changed
default exclusion/constructor/coverage semantics and install lifecycle scripts
were not executed; narrow tests do not prove every test remains compatible.
No live-account, native/Desktop visual, microphone or remote-exploitation proof
is claimed. The six remaining high entries are xmldom, fast-uri,
http-cache-semantics, source-map-js, undici and runtime Vite.

The [separate Desktop Vite checkpoint](DESKTOP-VITE-SOURCE-2026-10-27.md)
uses 8.3.3 in its own dependency tree. Archive2/code `2d31393f` remains installed
until a new exact artifact is packaged, signed, notarized and checked.
