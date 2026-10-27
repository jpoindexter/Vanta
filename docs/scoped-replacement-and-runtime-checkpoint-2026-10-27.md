# Scoped replacement and runtime checkpoint — 2026-10-27

## Boundary first

This is bounded source verification, not a new installed-app or whole-roadmap
completion claim. The prior installed Desktop/normal CLI checkpoint is
`1d18f846`; [its exact delivery record](agent-rebuild-installed-2026-10-27.md)
remains historical evidence. Candidate, Apple and installed acceptance must
identify the new bytes separately before promotion.

The owner explicitly authorized a protected-kernel policy amendment for fresh,
one-time replacement of an ordinary file inside the current project. There is
no general Block override, standing overwrite grant, new approval store or
credential migration. Factory and MANIFESTO source are unchanged.

## File replacement and fresh approval

- The kernel recognizes only `Overwrite existing file ` followed by an absolute
  canonical existing regular file beneath the canonical project root. It asks
  for a human decision, never returns Allow for this exception.
- Missing files, directories, outside paths, traversal, noncanonical aliases,
  symlinks and multiple hard links are excluded. Kernel/factory/MANIFESTO,
  known secrets, standing instructions, Git/Vanta/provider control state and
  shell-startup paths remain blocked for this descriptor. Generic data loss,
  forced deletion, force-push and shell-prefixed descriptions retain their blocks.
- Non-Unix replacement fails closed until a supported hard-link-count check
  exists. No Windows execution is claimed.
- The existing file tool preserves the raw-path check before canonical aliases
  could disappear. A preview binds the captured before bytes and proposed after
  bytes through exact target, byte counts, SHA-256 fingerprints and the existing
  bounded line diff. It requests `fresh: true`, `canRemember: false`.
- Denial records `denied` and leaves the file unchanged. Approval still uses the
  existing captured-inode/content/parent revalidation, checkpoint and write path.
  No retry or second write implementation was introduced. Its previously
  documented cross-process openat/CAS limit is not solved by this change.
- The separate existing control-plane confirmation path, including its exact
  instruction-alias checks, is preserved; this exception does not replace it.

ACP had independently dropped the shared `ApprovalDetail` flags. It now preserves
them, excludes one-time requests from session grants, offers only one-time
choices and accepts only an option actually offered. Exact one-time action
identity, reason and diff reach the client. Ordinary session edit grants remain
usable; this is not a removal of remembered routine permissions.

## Existing maintained WebSocket transport

Both direct Node-only gateway WebSocket constructors—Nostr and Twitch—now import
the existing production Undici `7.30.1` implementation. Native browser/global
constructors, Fetch initialization, dependencies and locks are unchanged.

Actual installed Node/Electron version probes found embedded Undici `7.29.1`
in agent3 and `6.27.0` in the normal CLI Node. Both are within
[GHSA-9fm3-97px-rjf6](https://github.com/nodejs/undici/security/advisories/GHSA-9fm3-97px-rjf6),
which explicitly includes Node's global WebSocket; the already shipped npm
`7.30.1` is patched. A clean npm production audit alone did not fix these callers.
The repair does not claim every embedded runtime or third-party path is patched.

## One shared native seam

The complete runtime-path resolver moved byte-identically to the existing
`vanta-ts/desktop-native` folder. The old import is a compatibility re-export;
two Next imports use the neutral module and the classic packaging allowlist
includes it. No runtime paths, state/profile routing, UI or lifecycle changed.
Direct Next native dependencies on old Desktop fall from six modules/nine import
sites to five/seven. This is not permission to remove the old Desktop or a claim
that session/state/gateway modularization is complete.

## Executed source evidence

- Parent combined focused run: **195 passed across 13 files**; runtime typecheck
  passed. No full application suite was run.
- Rust: ordinary replacement initially reproduced Block; the small complete
  kernel suite subsequently passed **79/79**. Additional relative-path and
  provider-secret controls failed before their narrow corrections, then passed.
- Independent actual release-kernel replay: **29/29** expected verdicts and
  unchanged fixture bytes. Unsigned release kernel SHA-256:
  `0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`.
- ACP: seven initial regressions reproduced dropped freshness/unoffered allow
  responses; two further regressions reproduced hidden exact identity. The real
  source ACP stdio runner, actual edit tool and unchanged prior kernel passed an
  ordinary session grant → fresh instruction-edit denial → ordinary edit journey.
  All three returned `end_turn`; explicit denial was not relabeled unknown.
  New-kernel source ACP stdio subsequently passed the six-turn actual-tool
  replacement journey: session edit grant; replacement deny/approve once/deny
  again; instruction-edit denial; ordinary edit still usable. Five prompts,
  twelve controlled provider completions, exact previews, expected confirmed/
  denied receipts and natural EOF exit zero. This is an injected-provider source
  entry with two real tools, not full packaged-CLI acceptance.
- WebSocket: poisoned native globals failed both actual adapters before repair.
  **63 focused checks** then passed, including real loopback handshakes,
  buffer/drain, signed Nostr publication, IRC PONG, one safe protocol PING/PONG,
  send and close. No live relay/Twitch credentials, public TLS or exploit stress.
- Native seam: **15 host and 17 Next checks**, Electron typecheck and strict size
  checks passed. Actual source launcher → private server → unauthenticated denial
  → authenticated request → stop passed, with owned children/listeners closed.
  A first replay's unnecessary eager-kernel assertion failed and was retained;
  the corrected no-model server criterion makes no kernel-startup claim.
- Original 239 integration work-file hashes, owner-data backup/current data and
  normal launcher remained unchanged before promotion.

Private source evidence packets: `trust-continuation-20261027-482iSw`,
`overwrite-authority-review-20261027-TPYTsK`,
`replacement-kernel-review-20261027-BgHbI3`,
`ordinary-overwrite-20261027-oYDYee`,
`websocket-adapters-20261027-kIAmV7`, and
`runtime-path-extract-20261027-rjOEj8`. Their failed attempts and exact manifests
are retained outside Git. Existing unused-import/dead-code Rust warnings remain.
The six-turn source receipt is in `source-fresh-replacement-20261027-wAbIyR`.

## Security inventory and remaining work

Fresh private lock audits found runtime production **0** known advisories;
runtime all-dependency **1 high**; Desktop production **12** (8 low, 4 moderate),
all-dependency **18**; website **40** (19 critical, 12 high, 3 moderate, 6 low);
SDK **0**. The Rust lock contains no third-party crates. These are dated audit
observations, not a security clearance or proof of reachability.

Authenticated GitHub reads returned **176** open alerts on the older default
branch, rather than the previous dated 177. Thirty-seven nonwithdrawn alerts
still match current locked ranges: one runtime build/cache and 36 website alerts.
The new Desktop lock is not represented by that default-branch inventory.
Nothing was dismissed. No main merge, public release/tag, CI or paid service was
enabled. See the frozen `dependency-triage-20261027-q0C4f3` report for ranges,
withdrawals, shipped-package intersection and compatible next candidates.

Full capability/attention contracts, review-clear, running-sibling cancellation,
broader dependency remediation, live accounts, owner parity/accessibility and
unfamiliar-person acceptance remain open. Existing card IDs, Done contracts,
dependencies and shipped history must not be replaced by these bounded checks.
