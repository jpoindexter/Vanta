# Agent8 local Desktop delivery — 2026-10-28

Historical delivery: [agent9](agent9-installed-2026-10-28.md) now supersedes the
installed app described below; agent8 remains its verified rollback. The original
evidence and the limits at this checkpoint are retained unchanged.

The exact app at `/Applications/Vanta.app` is now signed, Apple Accepted and
stapled `0.1.0-local.20261028.agent8`, built from
`430530cd220d8178cb4495af64b312c471382f5e`. Agent7 is retained for rollback.
Normal `vanta` remains on verified `2d739e68`: this delivery changes the Desktop
renderer, not the maintained CLI backend. No credentials or approvals were moved.
This is a local delivery, not a public release or whole-product acceptance.

## Delivered change and exact inputs

This delivers the [New chat/fork guard and activity repair](created-session-guard-2026-10-28.md):
one complete route-guard extraction and three empty-thread activity-read guards.
The rejected ID-based candidate is not included. Preserved sidebar, composer,
titlebar and navigation work remains part of the declared dirty build inputs,
not silently committed work or a newly approved visual redesign.

Embedded source provenance records `dirty: true`, 8,297 selected files and SHA256
`268bf31f2e2834eb44883f73423b094cf732e2e76123700b609dcce76cb58c4b`.
The verified release kernel was explicitly selected instead of the unrelated
debug output. Assembly inputs and final artifacts are separately fingerprinted;
the provenance does not claim a hermetic build.

## Executed candidate and installed behavior

Both the exact candidate and installed app passed the same six checkpoints:

1. Submit New chat Alpha and land on its actual stored session route.
2. Submit New chat Beta without replacing Alpha or creating duplicates.
3. Use the real sidebar Branch action; retain the exact parent transcript/cwd.
4. Continue the child, switch away/back, retain the parent unchanged.
5. Quit and cold-restart the same private profile; all three chats remain
   selectable with exact stored histories.
6. Collect zero renderer errors, including errors collected after shutdown.

Both app lifetimes verify packaged identity, exact executable/resources/ASAR,
bundled CLI ancestry and actual mapped app/CLI/kernel executables. No source
runtime or kernel override is used in the GUI replay. Five artifact hashes match
before, during and after each proof. All private test processes/ports close.

Both copies also pass the unchanged packaged ACP six-turn file regression:
five permission decisions, twelve completions, an ordinary edit grant,
deny/approve-once/re-deny replacement, protected instruction-file denial and a
later edit retaining its routine grant. Exact previews, file bytes and six file
receipts match. Six additional turn receipts are distinct from those file receipts.
The CLI exits naturally on EOF. This is a scripted permission-client proof,
not a human clicking the Desktop approval UI.

These are private-profile, loopback canned-model tests, not owner-provider,
live-account, native-control, whole-feature or human acceptance.

## Apple, archive and installation

The old default notarization profile was unavailable. Yesterday's setup receipt
identified an existing dedicated working profile; it authenticated without key
creation, credential replacement or reading/displaying private-key bytes.

Submission `02a782ff-b557-4d40-8d49-f18e2592245b` is Accepted. The waiting command
timed out, but direct readback of that same ID established acceptance; no second
submission was made. Stapling, ticket validation and Gatekeeper passed. Extracted
archive ticket validation then hit an Apple CloudKit timeout. The failed logs
remain; the unchanged complete archive validator passed on retry, without
rebuilding, resubmitting or weakening a check.

Final archive: `Vanta-0.1.0-local.20261028.agent8-arm64.zip`, 228,707,733 bytes.
SHA256: `d39fb93bf7168a5bc982fd260b362eb49ee1bf984a8f62cdc8c85f6e7bf50859`.
The stapled candidate, extracted archive and installed app share full fingerprint
`8d6a3b2cbaf43f9ef4ff97ef062abea809de2b340e188a9c5e617cde27764c67`
over 20,976 files. The guarded installer verified an idle destination, staged and
validated the app, retained agent7, then verified the replacement. The retained
agent7 full fingerprint matches its pre-install baseline, not merely its version.

## Preservation, remaining work and re-entry

All 239 original integration-work files, 13 modified legacy CLI files, 43 original
status entries and 32 owner-data baseline files remain unchanged. Old CLI pins,
app rollbacks, generated agent7 products, recovery archives and failed/green
evidence remain. The normal CLI selection is unchanged.

Private evidence packets: `agent8-delivery-20261028-QnoTyV`,
`agent8-session-journey-20261028-mXBSbZ`, and
`agent8-fresh-approval-20261028-QNnqTK`.

Backend fork-parent metadata still does not persist. History continuity above
does not prove durable tree ancestry. Next: preserve immediate-parent metadata
through storage, live CLI forks, JSON export and both Desktop projections, then
extend the real cold-restart proof. Do not guess checkpoint-copy ancestry.

Whole-flow draft/attachment/queue/reading-position coverage, owner visual and
accessibility/parity sign-off, live-account/native control, human acceptance,
remaining trust/security gates and complete modularization remain open. Prior
agent7 worker/terminal evidence is historical and was not rerun or relabeled as
new agent8 evidence. No cards are promoted to Done. No protected source changes,
main merge, public release/tag, CI, paid services or legacy retirement.
