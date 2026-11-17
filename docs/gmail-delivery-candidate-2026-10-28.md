# Gmail delivery candidate — 2026-10-28

Historical agent13 checkpoint. The [agent14 delivery record](agent14-cli-delivery-2026-10-28.md)
supersedes the CLI-selection and packaged-fixture status below; retained failures
and the live-account `invalid_grant` boundary remain relevant.

## Verdict

**T03-4 remains incomplete.** The independent CLI candidate has executed terminal
approval evidence. The signed Desktop candidate has executed ordinary-chat and
cold-restart evidence, but its Gmail approval journey has not passed. Neither
candidate has replaced the normal CLI selection or installed agent11 app.

## Exact candidate

- Source: `121ad43bea6e9abe8d52b412e918605a5cafabe5`.
- Desktop version: `0.1.0-local.20261028.agent13`.
- ASAR SHA-256: `82ffc79947981218a9d3d14e90c15855e9cdb9b281347a9bcb6c8452deca5d61`.
- Build uses an isolated source clone plus the eleven explicitly preserved
  tracked Desktop/test/document inputs. The unfinished four-file voice patch
  is excluded, not deleted or incorporated without acceptance.
- Dependency locks and the existing kernel input are unchanged. Build provenance
  declares dirty inputs; it is not a hermetic or HEAD-only build claim.

## Executed evidence

| Path | Observed result | Does not establish |
| --- | --- | --- |
| Independent CLI source identity | 10,487 tracked blobs match the source checkpoint; no object alternates; original launcher/selection unchanged. | Installed CLI cutover. |
| Compiled CLI HTTP replay | Eleven local HTTP cases, including four separate-process replays. | Human, Keychain or live Gmail acceptance. |
| Actual candidate `run.sh` in a PTY | Sender preview and one-use-only approval; allowing creates exactly one fixture submission; denying a draft creates none; changing the credential during approval creates no additional submission and requests fresh authority. | Owner approval or a real recipient/provider. Keys were driven by the test operator. |
| Actual packaged Desktop | New chat, second chat, Branch, continuation and switching; exact three-chat histories and parent relationship survive cold restart; both renderer lifetimes have zero errors. | Whole Desktop parity, pending-approval continuity or Gmail UI acceptance. |
| Package | Renderer/runtime assembled; Developer ID signed; Apple Accepted, stapled, Gatekeeper accepted and extracted archive verified. | Installation or live-account operation. |

## Notarized artifact

Apple submission `aace76b6-4da9-4c8b-a205-e3542f2b64d8` was Accepted. The maintained
notarization/archive command exited 0 after stapling, ticket validation,
Gatekeeper assessment and extraction validation. Archive status:
`notarized-archive-verified`; size 199,585,145 bytes. ZIP SHA-256:
`7ecaf9661d8a7a8a489aa71963a057570bffa3f214b5f4e270a5cbe226f78583`.
This is a retained local candidate, not a public release or installed update.

## Failed fixture evidence retained

Two terminal harness attempts did not isolate every transport: CLI startup
replaced the global fetch hook, then the OAuth library's node-fetch path did not
use the dispatcher hook. They used fake credentials only, returned HTTP401 or
invalid_client, and submitted no message. A transport self-check subsequently
exercised builtin fetch, maintained fetch and the external OAuth library, with
nonfixture fetch rejected; the final terminal run then passed its bounded cases.

The packaged Desktop Gmail journey returned invalid_client before an approval
card, with zero local fixture requests and zero submissions. An initial diagnosis
attributed that to the bundled OAuth implementation; direct inspection disproved
that explanation: the bundle imports the same external OAuth library. A bounded
run of the exact packaged executable reports that Electron disables Node
environment variables when invoked by other apps; the dispatcher is still the
original Agent and the prototype hook is absent. The test preload never ran.

This is failed host evidence, not a Gmail success or proof that every attempted
request was confined to loopback. No owner credential was supplied. Preserve the
launch restriction; do not disable Electron security or modify production
transport/authority to fit the harness. Establish a supported isolated transport
seam, or obtain fresh owner authority for any real-account acceptance path.

Local evidence packet: `gmail-delivery-20261028-mBsX9w`; receipts include
`tty-proof.json`, `candidate-lineage/result.json`, the retained failed
`candidate-gmail/result.json`, build provenance and process-exit evidence.

## Owner-authorized read-only account check

After fresh permission for a sender lookup only, the exact candidate's compiled
Vanta profile/auth helpers were used without a renderer or fixture override.
Google rejected OAuth with HTTP400, category `invalid_grant`, before a sender
profile could be returned. A bounded diagnostic repeated the rejection with
only the known error category retained; raw provider error details and credentials
were suppressed. No mailbox content was read, no draft/send endpoint was called,
no credential was copied and no token/auth-store bytes were rewritten.

This does not identify whether the grant expired, was revoked or failed another
Google grant condition. Reconnection needs an owner-driven OAuth consent flow;
permission for the read-only lookup does not authorize reconnecting, creating a
draft, sending mail or approving an external effect. The sender and packaged
approval journey remain unverified.

## Next acceptance and limits

Finish the packaged Gmail sender/denial/once controls, then use the guarded
installer and repeat the installed check with recoverable rollback. Normal CLI selection requires fresh
owner authority; its earlier one-use cutover authorization was already consumed.

No full-suite rerun, live-account send/readback, owner visual/parity, microphone,
VoiceOver or unfamiliar-person acceptance ran in this checkpoint. No main merge,
release/tag, paid service/CI, protected-source edit or legacy removal. TRUST-03,
OP-03 and the full delivery goal remain open.
