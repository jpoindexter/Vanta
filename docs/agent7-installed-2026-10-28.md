# Agent7 local delivery — 2026-10-28

Normal `vanta` now selects verified source `2d739e683b228f65d0a473094822cabd03fdd1b9`.
The signed, Apple Accepted/stapled app at `/Applications/Vanta.app` is
`0.1.0-local.20261028.agent7`, from the same source commit. This is a local
delivery on the unmerged integration branch, not a public release or a completed
Desktop redesign. Agent6 and the previous CLI pin remain available for rollback.

## What this delivers

Agent7 includes the [immutable startup generations](startup-cache-generations-2026-10-28.md)
and [saved-rule cancellation repair](saved-rule-cancellation-2026-10-28.md).
Cancellation observed before rule publication prevents the pending preference
from being saved; a committed preference is not revoked or replaced by an old
snapshot. Actual turn/worker lifetimes reach approval hosts and stale request IDs
cannot approve newer prompts. Project, fresh/one-time and kernel restrictions remain.

The build truthfully records `dirty: true`: the 43 preserved worktree entries
were not silently committed, discarded or described as a pristine HEAD-only
renderer. Declared-source fingerprint is
`458accc98a27874a2c9a156a1c7ad75197a7fb09d8d92912209ced3f8fbcc6a0`
over 8,293 selected files. Assembly and final-app fingerprints bind the actual
artifact; this is not a claim of a hermetic build or whole-feature parity.

## Executed CLI acceptance

- Independent checkout: 10,439 exact Git blobs, no hardlink/alternate object
  dependency, clean tracked state, exact kernel and 34,522 matching dependency
  files. Only approved nonsecret high/standard defaults were copied.
- Three simultaneous cold launches selected three complete generations. Warm
  startup and the unchanged global launcher passed.
- Twenty-six actual ACP/MCP/file/fresh-denial/Cancel checks and five worker cases
  passed using the actual CLI/kernel and private loopback fixtures.
- Real terminal: first conversation, `/restart`, saved-context re-entry, second
  answer and natural quit passed through the unchanged global launcher.
- Real terminal: choosing “don't ask again” saved a project-scoped edit rule;
  an actual private-file edit completed, then a second edit after `/restart`
  completed without another prompt. The four model completions and exact file/
  rule bytes were checked. Typed text and Enter were sent as separate key events.
- Atomic runtime-selection replacement, actual owner-memo readback, private
  global-launcher post-cutover replay and identity checks passed. No owner profile,
  credential or approval store was opened or migrated.

The original 38-receipt readiness seal and its separate six-file supplement are
retained. Twenty-two main and two supplemental private ports were checked closed.
The inactive pre-cold generation was moved into recovery before cold testing;
its compiled modules match the current generation, rather than being lost.

## Exact candidate and installed acceptance

Both the final candidate and `/Applications/Vanta.app` passed ordinary Home chat,
cold unsent-draft recovery without automatic send, explicit recovered-draft send
and zero renderer errors across both lifetimes. Live process inspection confirmed
the exact packaged executable, bundled CLI and bundled kernel, with no source
runtime/kernel override. Tests used private profiles, not the owner's account.

Both also passed the six-turn file-approval journey: five decisions, twelve
normal model completions, exact preview/deny/approve-once/re-deny, protected
instruction-file denial and retained routine grants. Five worker cases passed
for each copy: uncertain effect, independent success, read-only limit, canceled
approval/late reply and parent Cancel. Their CLI processes exited normally.

Apple submission `8ff78b06-16ed-4364-9fba-fc3896e171bb` is Accepted. Stapling,
staple validation and Gatekeeper passed. The first combined notarization command
nevertheless exited 1: post-staple ZIP extraction failed in the macOS temporary
directory. That failure remains recorded. Without rebuilding or resubmitting,
the unchanged full archive validator passed in an owned temporary directory,
including extraction, strict signature, ticket and complete fingerprint checks.
Future delivery procedures must select an owned temporary directory up front.

Final ZIP: `Vanta-0.1.0-local.20261028.agent7-arm64.zip`, 228,706,812 bytes.
SHA256: `ec727c84dfdc484c059609badc30edb306f6e2d0b68c090da60a3354160e6e0a`.
Final candidate, extracted archive and installed app fingerprint:
`cc48773c13bc0ff79d13cdbda98857ca757f02cfa79cd956e93694eaa0def2e6`
over 20,976 files. The guarded installer retained exact agent6 rollback; its
signature and full fingerprint match the pre-install baseline.

## Preservation and boundaries

All 239 original integration-work files, 13 modified legacy CLI files and 32
owner-data baseline files retain their hashes. All 43 original worktree entries
remain. Old pins, app rollbacks and signed recovery archives are retained.
Private packets `saved-rule-delivery-20261028-4LybWS` and
`agent7-delivery-20261028-K3IjPk` contain exact receipts and rollback locations.

This does not establish owner-provider/live-account operation, visible native
control, GUI Stop, full visual/accessibility/parity sign-off, unfamiliar-person
acceptance, cross-process permission transactions, fsync crash durability or
complete modularization. No kernel/factory/MANIFESTO edits, permission relaxation,
credential/approval migration, main merge, public release/tag, CI or paid services.
The TUI default-port banner still ignores the private URL override; actual private
endpoints were checked independently. Broader Trust/Operator cards stay open.
