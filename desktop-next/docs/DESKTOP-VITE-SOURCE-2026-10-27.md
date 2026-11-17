# Desktop Vite boundary repair — source checkpoint

## Gap first

The three reproduced development-server boundaries and the inherited optimizer
shutdown race are repaired in the canonical Vite 8.3.3 source/dependency tree.
This is not an installed-app update, Windows/WSL acceptance, full concurrent
Electron development-launcher closure or security-green claim. Archive2/code
2d31393f remains installed; no vendor patch or disabled optimizer/watcher ships.

## Exact change and custody

- Two application files: Desktop manifest Vite 8.2.0→8.3.3, matching root lock.
- The final supported closure updates 19 existing nodes and adds one required
  optional Android-arm binding: Vite, Rolldown 1.2.11, PostCSS 8.5.28,
  picomatch 4.0.7, types 0.151.0 and 15 platform bindings. No node is deleted;
  unrelated resolutions, historical workspace records, config/scripts are intact.
- Six changed package nodes present on this Mac were replaced through five roots.
  Fourteen absent foreign-platform bindings were not installed. Old packages, hidden lock and exact source
  preimages remain outside the repo. A nested-backup name collision safely
  refused a rename; all preimages were retained under explicit recovery paths.
- All 20 pinned integrity values match freshly retrieved official npm metadata.
  Candidate tarballs had already been integrity-checked before extraction; no
  install hooks, overrides, forced major update or source workaround was used.

## Executed parent red/green

Actual Vite servers used owned synthetic fixtures on loopback, no owner data,
browser or real external host. Each fixture server closed and its process exited.

| Boundary | Original 8.2.0 | Integrated 8.3.3 |
| --- | --- | --- |
| Root/absolute-path collision | HTTP 200 exposes owned outside fixture | HTTP 403; fixture absent |
| Denied-file Wasm query | HTTP 500 exposes fake first 4 bytes | HTTP 403; bytes absent |
| Custom HTML URL | foreign script URL emitted | no foreign script URL |
| Ordinary HTML | HTTP 200 | HTTP 200 |

Primary advisories: [root collision](https://github.com/advisories/GHSA-rq7h-c2jc-7f22),
[denied Wasm](https://github.com/advisories/GHSA-vfpm-58rq-9qcg),
[custom HTML](https://github.com/advisories/GHSA-9jrq-w75r-8gcw).
Original/intermediate fixtures used Vite's default available port (`port:0` is
not OS-ephemeral in Vite). The final supported fixture explicitly reserves an
OS-assigned loopback port with strictPort, then verifies cleanup and natural exit.

Scoped npm dependency tree exits0 with no problems; three existing mocker
boundary tests pass. Canonical renderer/main/preload build passes. The actual
source Electron chat→archive→restore→reopen→quit/relaunch journey passed 5 checks
against the intermediate 8.2.4 build, not final 8.3.3 native acceptance. Final
8.3.3 actual app-config/API startup, three HTTP 200 routes and server.close complete
with optimizer/watching unchanged; the child naturally exits 0 in 13.899 seconds,
with no signal/timeout. No full suite or Vanta exploitation claim follows.

## Audit and remaining work

Fresh matching-workspace production-lock audits 13→12: high 1→0, moderate 4/low 8
unchanged; only Vite is removed. This does not clear the remaining 12 findings,
runtime development/website/default-branch alerts or disputed cache max-stale
behavior. The latter is unchanged by the separate cache maintenance.

Both 8.2.0 and 8.2.4 can leave optimized-module processing promises unsettled
after cancellation, producing unfinished-await exit 13 or bounded timeout.
Official 8.3.1/8.3.2 have cleanup but remain in the security advisory ranges;
8.3.3 is the smallest verified forward release containing both repairs.
The official [optimizer cleanup](https://github.com/vitejs/vite/blob/v8.3.3/packages/vite/src/node/optimizer/optimizer.ts)
cancels scheduled/in-flight work and settles pending processing before close.
The private two-line diagnostic edit was inconsistent and never shipped.
The subsequent [Home continuity source checkpoint](HOME-ATTACHMENT-CONTINUITY-2026-10-27.md)
runs the actual canonical-source Electron application on final Vite 8.3.3:
11 bounded cross-project/text/image-only restart checks pass, with zero renderer
errors. This is not full rendered HMR, Windows/WSL/editor or npm concurrent
Electron/signal acceptance. Packaging/install and owner acceptance need exact new proof.

Parent receipts: `desktop-flow-vite-20261027-pBbpGZ`; original intermediate
packet `desktop-vite-20261027-9JBOfR` and supported forward packet
`desktop-dev-shutdown-20261027-V2GZNl`. Exact old/intermediate/new preimages are
retained. All 239 original preserved work files remain unchanged.
