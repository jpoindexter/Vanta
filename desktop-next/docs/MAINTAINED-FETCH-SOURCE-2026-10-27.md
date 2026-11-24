# Owned-process Fetch repair — source/staging checkpoint, 2026-10-27

## Delivery boundary

This source change is not installed or publicly released. Installed home1 remains
unchanged. Its embedded Node Fetch still fails the previously recorded primitive
fixtures; notarization did not repair that implementation. The application now
selects maintained npm Undici 7.30.1 in the owned paths below instead of relying on
that embedded implementation. This is not a claim that every process is repaired.

## Smallest complete integration

- The CLI's first side-effect import selects a coherent `fetch`, `Headers`,
  `Request`, `Response` and `FormData` family before static or dynamic consumers
  capture defaults. WebSocket, EventSource and their event constructors remain.
- Electron main explicitly injects maintained Fetch into authenticated readiness
  and the existing request/SSE transport. The browser/shared transport stays
  Node-free. The classic tray retains caller injection and uses the maintained
  default. No permission, redirect, SSRF, TLS, retry or timeout policy changes.
- The public SDK remains import-neutral and preserves `options.fetch`.
- Undici is an exact production dependency. The runtime closure grows 247→248
  packages, adding only this existing leaf; both complete MIT notices are
  retained in the shipped NOTICE. Classic packaging and runtime staging include
  the bootstrap files, including the source/tsx fallback; test-only files stay out.

Import-neutral means no replacement of named Web APIs. Upstream Undici initializes
its dispatcher symbols; Vanta adds no dispatcher override. Pre-initializer native
FormData/Request objects are not generally interchangeable with Undici objects.
Owned runtime consumers construct them after initialization; the covered main
callers use URL/JSON/SSE. The declaration bridge is not universal cross-family
compatibility evidence.

## Executed evidence

Parent packet: `maintained-fetch-parent-20261027-qbX8Ro` under Vanta-backups.
Frozen bootstrap: `runtime-fetch-bootstrap-20261027-oPvNUI`.
Independent consumers: `maintained-fetch-consumers-20261027-YsaQGB`.

- Exact installed executable in Node mode, private staged module: tiny malformed
  six-coded response changes caught-then-unhandled exit 1 to controlled rejection
  and natural exit 0. Matching integrity succeeds; incorrect lowercase/uppercase
  integrity rejects. No stress, remote account or full-agent exploit was used.
- Actual readiness/ServerHost callers, bundled with their real collaborators,
  pass six loopback checks: authentication, profile/body preservation, live SSE,
  silent cancellation, controlled malformed-response failure and timeout. Named
  global Fetch is deliberately unusable in this fixture, proving injection.
- The full 248-package runtime is staged as real files. Both compiled and
  source/tsx launch paths run through the real Electron shell and real Vanta
  custom provider against a loopback model: one streamed chat, exact unsent Home
  draft across cold restart, no automatic replay, one explicit additional send,
  and zero renderer errors. Four checks per path; not paid-provider acceptance.
- Exact installed Node-mode direct caller checks preserve real Telegram
  multipart/binary bytes, actual OpenAI/Anthropic SDK JSON and fragmented streams,
  wire abort and no request on pre-abort, plus downloader Range resume, 200
  restart and cancellation. Baseline and maintained runs exit naturally 0.
- SDK import neutrality and explicit injection, constructor coherence, entry
  ordering, 33 focused main tests, four tray/Telegram tests, staging regression,
  seven runtime-bundle tests, full runtime and Electron types, native/runtime
  bundling, five architecture boundaries and strict changed-source size pass.

The first parent chat fixture lacked the private kernel path required by the
source-development layout. Its timeout/screenshot remain; supplying the unchanged
kernel in that private layout yields the two passing journeys. No product gate
was bypassed. A main fixture initially asserted the wrong session-header name;
the corrected fixture asserts the actual existing header. An attempt to run the
excluded test file from the staged tree correctly found it absent. The canonical
test instead ran with the installed executable. These are retained harness
corrections, not hidden product successes.

## Remaining gates

No new signed/notarized package or installation, owner-profile/live-account run,
full suite, proxy/TLS matrix or universal plugin/AnyDoc/external-process coverage.
An existing download Vitest invocation did not start in the signed executable:
macOS rejected Rollup's native addon Team ID; no signing workaround was applied.
Direct downloader behavior above is separate evidence, not that suite passing.

Both provider baselines and maintained adapters emit partial `done` after SDK
abort. Wire cancellation does not establish agent/workflow settlement; that
separate defect remains under investigation. MCP cancellation is also separate.

This checkpoint does not close any whole Desktop or trust card. Runtime npm
production audit is zero; disputed development cache semantics, separate Desktop,
website and old default-branch alerts remain independent open boundaries.
