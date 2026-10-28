# Gmail delivery candidate — 2026-10-28

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
| Package | Renderer/runtime assembled; Developer ID signing completed. | Notarization, installation or live-account operation. |

## Failed fixture evidence retained

Two terminal harness attempts did not isolate every transport: CLI startup
replaced the global fetch hook, then the OAuth library's node-fetch path did not
use the dispatcher hook. They used fake credentials only, returned HTTP401 or
invalid_client, and submitted no message. A transport self-check subsequently
exercised builtin fetch, maintained fetch and the external OAuth library, with
nonfixture fetch rejected; the final terminal run then passed its bounded cases.

The packaged Desktop OAuth implementation is bundled separately. Its first
Gmail journey returned invalid_client before an approval card, with zero local
fixture requests and zero submissions. This is failed host evidence, not a Gmail
success or proof that every attempted request was confined to loopback. No owner
credential was supplied. Stop repeating class/prototype hooks; establish the
bundle's actual transport seam with a bounded no-effect check before retrying.
Do not change production transport or weaken approval policy to fit the harness.

Local evidence packet: `gmail-delivery-20261028-mBsX9w`; receipts include
`tty-proof.json`, `candidate-lineage/result.json`, the retained failed
`candidate-gmail/result.json`, build provenance and process-exit evidence.

## Next acceptance and limits

Finish the packaged Gmail sender/denial/once controls, complete the Apple verdict
and exact archive validation, then use the guarded installer and repeat the
installed check with recoverable rollback. Normal CLI selection requires fresh
owner authority; its earlier one-use cutover authorization was already consumed.

No full-suite rerun, live-account send/readback, owner visual/parity, microphone,
VoiceOver or unfamiliar-person acceptance ran in this checkpoint. No main merge,
release/tag, paid service/CI, protected-source edit or legacy removal. TRUST-03,
OP-03 and the full delivery goal remain open.
