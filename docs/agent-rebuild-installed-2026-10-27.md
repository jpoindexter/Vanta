# Agent rebuild — installed delivery, 2026-10-27

## Remaining gaps first

This delivers the bounded agent repairs, not all roadmap cards. Nested overwrite
confirmation is still blocked by the kernel before an approval dialog: the tool
asks for `Overwrite existing file …`, which the existing data-loss policy blocks.
No human rejection or successful approval was executed for that path. Do not
relax the kernel or infer fresh authority to make it pass.

Review-clear UX, running-sibling cancellation, complete continuity, live accounts,
owner visual/per-item parity, accessibility and unfamiliar-person acceptance,
dependency/security closure and full modularization remain open. No new visual
redesign, broad suite, main merge, public release/tag, CI or paid service occurred.

## Exact installed identity

| Field | Executed value |
| --- | --- |
| App | `/Applications/Vanta.app` |
| Local version | `0.1.0-local.20261027.agent3` |
| Source checkpoint | `1d18f8468a1afe7295e573cfce907e26c11cd83e` |
| Declared source digest | `43001aa4a6fe616d078675cc9420598fa1532d9476e09b99a75fc17d5f541b9b`, 8,278 files |
| Assembly digest | `d991793248c03125db77954542b5b7976f13c4d83d2399031daef52522d3ef69`, 21,886 files |
| Installed/candidate ASAR SHA256 | `5b05ebc9397481d2a4298a9f21a3dad11de2298f8cf7edc494a5655a6ab00e0b` |
| Apple submission | `ba9af3b1-db25-4923-b4bb-1dc78c2d0ea6`, Accepted |
| Final ZIP | `Vanta-0.1.0-local.20261027.agent3-arm64.zip`, 224,665,300 bytes |
| ZIP SHA256 | `08cf0e2d048b1dd8299bd0dbcaa0487f4eb242fb649e984f6a8eefd1ce4d4add` |
| Retained rollback | `/Applications/.vanta-install-backups/update-byJTwn/Vanta.app` |

The Developer ID signed app passes deep/strict signature verification, ticket
stapling/validation and Gatekeeper assessment. The final ZIP was rebuilt after
stapling, extracted, checked and fingerprint-matched. macOS refused a framework
link extraction in its default temporary folder; rerunning only the existing
archive helper with a private temporary directory passed every original check.
Apple was not resubmitted. A transient missing-profile lookup was repaired using
the downloaded key and explicit login Keychain; no key contents entered logs/Git.

Provenance declares a dirty source/assembly snapshot, not a hermetic HEAD-only
build. The source checkpoint and selected bytes stayed frozen from packaging
through installed execution. Original uncommitted work was neither reset nor
silently included in commits. The unchanged release Rust kernel ships with it.

## Executed candidate and installed behavior

Both exact bundle paths ran with their own executable, runtime and kernel;
identity was asserted, not substituted by a source-runtime override. Each used
private homes/user-data/projects and a deterministic loopback provider.

- Chat: one ordinary streamed Home turn, exact unsent draft after cold restart
  with no automatic send, one deliberate recovered send, zero renderer errors.
- Agent: authenticated foreground child refusal propagates unknown/unverified
  truth to the parent; no second provider call or follower execution. The
  follower's synthetic `none` receipt is bookkeeping, not an executed read.
- Ordinary delegated reading completes, provider-wait cancellation returns
  `cancelled`, and actual excessive-depth rejection makes zero child-model calls.
- Each final agent run makes eight controlled model requests and records two
  allowed depth-one launches and one denied depth-seven launch in real Rust.
  Both CLI processes exit naturally with code zero. ACP uses nonstreaming provider
  completion here; the separate GUI chat journey verifies streaming.

Two earlier candidate fixture failures are preserved: local default tool scope
omitted `delegate`, and the first harness assumed a human overwrite prompt and
absence of a skipped follower receipt. The final fixture explicitly allows only
read/write/delegate and asserts actual conservative stopping. It does not relabel
kernel rejection as human approval. No account mutation was attempted.

[Source evidence](agent-background-and-spawn-truth-2026-10-27.md) records 81
combined focused tests, typecheck, strict size on 21 changed files, independent
real conversation/queue and unchanged Rust proofs. Background readline recovery
was not repeated through every packaged host. Historical uncertainty whose typed
metadata was already compacted away cannot be reconstructed; no review-clear
operation was added.

## Normal CLI, preservation and publication

Normal `vanta` now selects a separate clean tracked pin at the same source SHA.
10,408 tracked blobs match the commit; Git objects are independent. Normal Node
22.23.1 cold/warm/cache, 27 real ACP/MCP checks and private global-wrapper routing
pass. Post-cutover wrapper initialization also passes. The actual compiled
configuration loader confirms the retained high-effort/standard-service defaults
at `vanta-ts/.env`; an unused root-level defaults file was archived, not mistaken
for loaded configuration. No credentials, profiles or approvals were migrated.

The previous CLI pin, original launcher and selection remain recoverable. All
13 original dirty CLI files, all 239 original integration work-file hashes and
the fresh 57-file owner app-data backup match. The installer retained home1 and
its receipt. Eight superseded generated app/report/ZIP items were archived with
hashes and inode checks; no original or superseded delivery files were deleted.
Original evidence and worktrees
were not classified as junk.

Canonical roadmap IDs, Done contracts, dependencies, shipped history and statuses
remain unchanged: 1,365 cards, 1,289 shipped, 64 parked, 12 open (two Building,
four Next, five Horizon, one Blocked). The missing-notary reason is resolved;
Desktop cutover remains blocked/deferred for its original parity/human gates.
GitHub integration pushes are not main merges or public releases. The source
push reported 176 default-branch dependency alerts; the documentation push at
18:19 UTC reported 177 (four critical, 87 high, 72 moderate, 14 low). These are
dated observations, not a security clearance; scoped local proofs do not resolve
the broader default-branch alerts.

Trello descriptions and one delivery comment were updated and read back on
[TRUST-03](https://trello.com/c/vjFFEM9t),
[OP-03](https://trello.com/c/nyVw8PAB) and
[DN-14](https://trello.com/c/s4XZoKBb). The two Building and Deferred—human-proof
states remain unchanged; earlier descriptions were retained verbatim.

Private delivery/rollback receipts: `agent-rebuild-delivery-20261027-exFA28`,
including `delivery-verified.json`, `cli-cutover-verified.json`, exact candidate
and installed results, archive logs and documentation preimages. CLI preparation
evidence is in `agent-cli-pin-20261027-Joz1g5`; its original root-defaults
assumption is superseded by the parent executed loader/cutover receipt.
