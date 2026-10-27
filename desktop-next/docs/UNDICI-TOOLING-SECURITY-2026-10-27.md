# Download transport tooling repair — 2026-10-27

## Important remaining runtime gap

This patches npm development/build dependencies, **not Node's built-in fetch**.
A separate tiny loopback-only probe executed the exact installed Home1 executable
in Node mode: Node 24.22.0 / Electron 43.8.1 / built-in Undici 7.29.1.
After catching a six-content-coding truncated-response rejection, that primitive
still raises an unhandled stream error and exits 1. Its uppercase integrity-token
mismatch is also accepted. The source host Node 22.23.2 / built-in Undici 6.28.0
also exits 1 on the response fixture, but rejects that integrity mismatch.

Those are executed primitive failures, not a full agent exploit, SSRF bypass or
normal-profile test. No owner data, account, remote service or app UI was used.
The installed app is unchanged; no runtime-level security clearance is claimed.
Official compatible runtime remedies and application fetch seams remain under
review. Do not infer an Electron patch fixes its bundled Node without proof.

## Compatible npm repair

Only six runtime-lock fields change across two existing nodes: root Undici
7.29.0→7.30.1 and node-gyp's nested 6.28.0→6.29.1, each version/resolved/integrity.
Both major lines, existing consumer ranges/engines, optional flags, production
records, manifests and inventory remain. Official tarball integrity was checked;
original leaves, source and hidden installation lock are retained. The preceding
shared-helper package inclusion is preserved; it changes no dependency contract.

Official advisories document the [orphaned stream error](https://github.com/advisories/GHSA-xjj6-f33q-929c)
and [case-sensitive integrity-token bypass](https://github.com/advisories/GHSA-f72v-6w45-q472).
The update retains the real caller's default retry policy, rather than disabling
retries or suppressing unhandled exceptions to obtain a passing result.

## Parent-executed actual caller proof

The unchanged canonical node-gyp `download` helper ran before and after in a
private child with one bounded ephemeral loopback server. Its ordinary tiny
HTTP 200 download succeeds in both versions. A six-coded truncated tiny body
produces a caught rejection in both; the fixture stays live through the retry
window. Before: an unhandled Readable/content-range mismatch terminates the
child with exit 1. After: the same helper rejects controllably, closes its owned
server and exits naturally 0, empty stderr, two requests. No forced-success exit,
retry override, remote download or stress test is used. The exact observed stack
is not attributed to an unexecuted individual upstream patch.

Eight in-memory integrity cases per snapshot exercise both npm leaves: matching
lower/uppercase tokens still pass, incorrect tokens reject after. The old root
uppercase bypass changes red→green; old 6.x already rejected both mismatches.
This is not proof Electron supplies such integrity metadata. `@electron/get`
uses npm Undici for its optional proxy dispatcher but global fetch for download;
upgrading the npm leaf does not replace that global implementation.

Scoped installed dependency tree and runtime typecheck pass. Fresh runtime
all-dependency audit: **two high→one high**, production-only zero. Remaining npm
row: disputed cache semantics. Built-in runtime, separate Desktop/website and
older default-branch findings are additional boundaries, not erased by that count.

Parent proof/audit/rollback: `undici-parent-20261027-boC6Wg`. Frozen independent
proposal/integrity metadata: `undici-20261027-C7faME`. Separate built-in receipts:
`builtin-fetch-20261027-ijOe3B`. Source lock postimage SHA256:
`855517e92c7c6c03632e725ec9bf415f4095f529ee1bfafce2128f8ffed47420`.

No proxy/TLS certificate flow, WebSocket/EventSource/cache-interceptor exhaustive
proof, full build/suite, new package/install, account action, public release/tag,
main merge, CI or paid service was performed for this checkpoint. Home1 remains
installed at code `feea5a4f`; whole security and trust are not complete.
