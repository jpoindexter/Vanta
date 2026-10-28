# Agent10 local Desktop delivery — 2026-10-28

`/Applications/Vanta.app` is now signed, Apple Accepted and stapled
**`0.1.0-local.20261028.agent10`**, built from source
`b67af10bcc4e8d74748f305564c7c7e8e7d84d96` with preserved dirty inputs explicitly
declared. Agent9 is retained by the guarded installer for rollback. Normal
`vanta` remains on source `70f05035`; no credentials, approvals, histories or
profile migration occurs. This is a local delivery, not a public release.

## Delivered behavior

The [live approval recovery repair](live-approval-recovery-checkpoint-2026-10-28.md)
now executes in both the exact packaged candidate and the exact installed copy.
It includes the earlier fresh-draft ownership and event-ledger extraction.
No new visual-design acceptance is inferred from these workflow repairs.

Each copy passes two real Electron approval/profile rounds. B waits at its
actual approval card; switch to A and type unsent text; A's route, words, logical
caret and focus remain stable. Return through B's actual session row and click
Allow once; observe exactly one append and then A's retained draft. Round 2
adds a full renderer reload: the original pending approval ID returns, no file
exists before approval, and one real click produces one effect. A's earlier
draft also survives reload before more words are appended. Real IPC observation
records exactly two chat submissions for the two rounds, not resubmission on
recovery. No direct approval POST substitutes for clicking the visible card.

Each copy separately passes New chat Alpha, distinct New chat Beta, actual
sidebar Branch, child continuation, switching and cold restart. All three exact
histories and their immediate-parent link survive. Saved data, backend list/
detail and the visible tree agree before continuation, before restart and after
restart. Both renderer lifetimes per copy and the reload journeys observe zero
errors, including shutdown collection; all identified private processes and
ports close. Models and profiles are disposable, not owner-account proof.

The app, bundled backend and mapped kernel are checked at their actual paths;
there is no source-runtime override in the packaged or installed journeys.
Candidate and installed ASAR, executable, compiled CLI, signed kernel and source
provenance hashes match. The complete final app fingerprint is
`5f6eef828a95443ab7298f9cb2d760acc175466670f975ed45241869fc7719ce`
over **21,111 files**. Declared source is **8,309 selected files**, SHA256
`9979bafcbe36ca0714e040a0eae71415a0960b54555a389cc5c3b359a1635b00`.
This is declared-input provenance, not a hermetic-build claim.

## Apple, archive and recovery

Apple submission `f6dba229-c741-4c62-9f25-8066841dfae0` is **Accepted**.
Stapling and macOS assessment pass for the candidate and installed app. Existing
dedicated credentials are reused; no key is created, replaced or inspected.

The initial final-archive extraction, and one unchanged retry, fail with EPERM
at the Electron framework link in macOS's default temporary directory. These
receipts remain recorded. Link layout and permissions look normal; a provenance
attribute is observed, but the precise platform cause is not established.

The same maintained archive validator then succeeds using an explicitly owned
private temporary directory. It retains the exact ZIP, extracts it, validates
the extracted ticket and signature, and compares complete app fingerprints.
No metadata stripping, weakened check, alternate unsigned installer, second
Apple submission or source modification is used. This establishes successful
delivery validation in that location, not a general fix for the default-temp
EPERM condition.

Final local archive: `Vanta-0.1.0-local.20261028.agent10-arm64.zip`,
**230,815,586 bytes**, SHA256
`3441e6a1b217b0bf9825ddb8860dd438fde00cbf1719c5aba195a739f256be56`.
The installer refuses a running target, stages and verifies the candidate, and
retains agent9 plus its receipt. Full rollback bytes match the pre-install app,
not merely its version. Older generated products and failed receipts remain
recoverable. Original 239 integration files, 13 modified CLI files, 43 original
worktree entries and 32 owner-data baseline files remain unchanged.

## Remaining gates

Full backend-process restart recovery, complete draft/attachment/queue/reading
continuity, owner visual/parity, unfamiliar-person and live-account acceptance,
native computer control, voice, dependency security and remaining modularization
are still open. No fresh agent10 terminal, ACP/MCP, worker, microphone or audible
VoiceOver run is claimed here; earlier CLI70 evidence remains separate.

No card status/Done/dependency promotion, main merge, public release/tag, paid
service/CI, protected Rust/factory/policy change or legacy retirement occurs.
Private evidence: `agent10-delivery-20261028-TVVNDA` and
`live-client-recovery-20261028-6B8EuN`. The source repair, delivery and remaining
product gates are distinct claims.
