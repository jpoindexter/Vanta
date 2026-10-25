# Installed Desktop candidate — 2026-10-25

## Gap first

The stale installed-app gap is resolved for source f5b12a97. This is a local
candidate, not a public release or complete Desktop acceptance. Security is
not green; see [dependency re-entry](DEPENDENCY-REENTRY-2026-10-25.md).
Owner visual, real-account/profile, audible VoiceOver, complete parity and
deferred unfamiliar-person acceptance have not been executed here.

## Exact delivered build

- Source: f5b12a9739e923a015a3cdf697c3f3102261298f, pushed to the existing
  claude/desktop-integration-20261013 branch and remote SHA verified.
- Installed: `/Applications/Vanta.app`, version `0.1.0-local.20261025`, embedded
  VantaBuildCommit `f5b12a97`; no CLI source/runtime replacement.
- Developer ID signed. Apple submission d42998e2-242b-420c-b00c-bad8669b342e
  returned Accepted; ticket stapled and validated. Installed codesign deep/
  strict, stapler and Gatekeeper checks exit 0 (Notarized Developer ID).
- Installed and candidate ASAR SHA256 both:
  `54d7da74fdaa5cf5bcd347b8870fee7f5d57623a9c5e1b3ff2d5eb389043b2a8`.
- 7,219 committed renderer/Electron/runtime source inputs match the isolated
  candidate. Five checks/ratchets are not a claim of full modularization.
- Kernel remains the existing Oct-14 release binary; no Rust rebuild/edit.

Notarized ZIP (193 MiB), generated AFTER stapling:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-deliveries/2026-10-25/Vanta-0.1.0-local.20261025-notarized-arm64.zip`

ZIP SHA256:
`8825620e2953ae19db909850db2f329b2482ab0cb25791c41933c2b9211e2804`.
This archive is local; no release asset/tag or binary was pushed to GitHub.

## Actual installed-path criterion

`VANTA_PACKAGED_APP=/Applications/Vanta.app node tools/done-path/run.mjs ...`
exits 0: 13 steps and seven probes PASS, using private HOME/VANTA_HOME/userData,
two throwaway projects, the packaged runtime/kernel and a loopback scripted
model. No source runtime-root override is passed to the packaged app.

Executed: new chat with live tools and exact approval; Always saved and honored
after cold restart/new chat in the same project; another project still asks;
Reject leaves its file unchanged; Plan refuses writes before/after restart;
irreversible publish/push asks freshly and is rejected; 200KB text and image
paste preserve typing/draft and send successfully; 1440/1100/800 layouts fit,
including drawer open/Escape close. Max keystroke99ms after text/22ms after
image. The mock receives the image and its attachment chip clears after send.

One console warning blocks navigator.vibrate without user activation. No
runtime exception was observed. A microphone permission-query probe is NOT a
hardware recording test. No real post, mail, account, deployment or external
command effect was executed. Native folder selection is stubbed in the test.
Raw evidence: [installed result](proofs/delivery-2026-10-25/installed/result.json)
and [Apple log](proofs/delivery-2026-10-25/installed/notarization.txt).

## Preservation and rollback

No installed Vanta app process was running; checked before staging and again
before replacement. The staged copy passed signature/ticket/security checks
before the old app was renamed; installation did not delete it or force-quit
anything. Launcher `~/.local/bin/vanta-next` already points at this exact app;
it was not rewritten. Normal-profile launcher interaction is not recertified.

Private recovery: `Vanta-backups/delivery-checkpoint-20261025-8VVfEN` has the
verified complete-history bundle, remaining dirty binary patch/untracked
archive, previous app, copied userData and scoped Vanta-state archive. Original
pre-integration recovery still exists. All 273 original changed/untracked
regular files retained identical SHA256 values. The working tree is NOT clean:
unrelated preserved work remains uncommitted. No main merge, PR reopening,
release/tag, paid/CI or owner-gate bypass. Goal stays ACTIVE.
