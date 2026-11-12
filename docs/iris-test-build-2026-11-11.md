# Vanta Desktop — Iris test build, 11 November 2026

> Superseded: [12 November build-tool-repaired Iris build](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.2). The original build and evidence below remain unchanged for rollback.

This is a testing checkpoint, not a production release or a claim that the
Desktop redesign, all agent capabilities, or the roadmap are complete.

## Exact build

- Version: `0.1.0-test.20261111.1`.
- Target: Apple silicon Mac (`arm64`). No Windows, Linux, or Intel build.
- Source: `96d4e0c3b666a3d67870158276de442fe716bb74` on GitHub.
- Source fingerprint: `4c3b6ce4cb4b5be91b62772856671db1edbbadb2328914e581181e8d4a6fa578`.
- Build starts from a clean isolated Git worktree; preserved recovery source is unchanged.
- Existing matching-lockfile dependencies are reused. Node: `22.23.1`;
  Electron: `43.8.1`. This is not a hermetic/reproducible-build claim.
- Unchanged kernel binary: `0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`.
  Kernel source is unchanged from its retained build checkpoint.
- Includes recovered source, including the pending local dictation transport.
  Passing transport tests do not establish microphone or speech-model operation.
- Legacy web-renderer assets were regenerated as packaging inputs; the app
  includes its bundled runtime and kernel, not a path to the owner's checkout.

## Install and test

1. Download the ZIP and `SHA256SUMS.txt` from the linked GitHub test prerelease.
   Verify with `shasum -a 256 -c SHA256SUMS.txt` from that download directory.
2. Unzip. If you already have Vanta, quit it and retain its app as a rollback
   before replacing it. Never run two versions against the same profile.
   Move `Vanta.app` to Applications and open it normally. Do not disable
   Gatekeeper, remove quarantine, or bypass a macOS security warning.
3. Configure your own model/provider through the app's connection/settings
   controls. Your own provider credentials and any required local model are
   separate setup; no Jason account, token, history, or preapproved authority
   is supplied. Provider usage may cost money under your own plan.
4. Use a disposable project folder. Start a new chat, send a short question,
   and confirm the response appears. Start another chat, switch back, and
   confirm the first conversation remains available.
5. Try a low-risk research or document task. Review consequential actions
   individually. Do not grant broad computer/account permissions merely to
   complete a test; skip unsupported features and record the limitation.
6. Quit and reopen. Check that your conversation is still present. Report any
   repeat setup, unexpected permission prompt, lost draft, or navigation issue.

Report the build version, macOS version, chip, steps taken, expected versus
observed result, and a redacted screenshot. Do not post API keys, access tokens,
private conversations, or personal/business documents in a public GitHub issue.

## Scope and limits

Only narrow, build-relevant checks are run for this delivery. A loopback model
check proves the packaged UI/backend chat route, not live-provider authentication,
research quality, business automation, account effects, computer control,
microphone input, speech output, accessibility acceptance, or Iris's own use.

The production lockfile audit on 11 November reported nine moderate advisories
in the Desktop workspace and zero in `vanta-ts`. This does not certify the
whole dependency tree, all bundled code, or GitHub's old default branch.
Do not use this test checkpoint for unattended consequential business actions.

No change to `main`, installed Vanta, the normal CLI selection, credentials,
approvals, private recovery archives, Time Machine snapshots, or backup policy.

## Delivery verification

Download: [Iris test prerelease](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261111.1).
The test tag points to the exact source commit above, not the later handoff-note
commit. The existing production release remains unchanged.

Executed locally:

- Desktop renderer and Electron typecheck: exit zero.
- Pending voice transport: ten focused tests passed; no microphone recording.
- Both renderer builds, runtime bundle, assembly, and Developer ID signing: exit zero.
- Apple notarization: Accepted, submission `5fef605a-4dbc-4b70-ab3e-393653b1e5ce`.
- Stapling, Gatekeeper assessment, deep/strict signature verification, and
  extracted archive fingerprint comparison: passed.
- Final ZIP: `Vanta-0.1.0-test.20261111.1-arm64.zip`, 211,838,762 bytes.
- ZIP SHA-256: `b74d3d54c9751c1820f6c8550a216a06ff8bec528c5171db523e53be67b262f9`.
- Final app fingerprint: `2ecb9616fdd015895c0ba28d4629a01c43c23cc445f0ee7ef98f639e24de8a5c`.
- Actual extracted app: new chat, local-model reply, and another new chat with
  empty usable composer passed; zero observed renderer errors. Runtime/kernel
  override variables were absent and user data was confined to a test profile.
- Secret scans of staged runtime and extracted renderer: no findings within
  the scanner's scope. No owner profile or account was packaged.

GitHub download readback is a separate delivery check, not proof that Iris's
machine, provider, or accounts work. No full suite, live account, microphone,
computer-control, unfamiliar-user, or comprehensive security acceptance was run.
